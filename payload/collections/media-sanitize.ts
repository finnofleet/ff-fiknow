/**
 * Asset-Content-Härtung am Media-Upload (SECURITY_AUDIT, Findings 6–8 /
 * ADR 0001, Sicherheits-Anforderung 6).
 *
 * Ein `beforeOperation`-Hook ist der EINE Chokepoint, der beide Upload-Wege
 * abdeckt: den Bundle-Import (`payload.create/update({ collection: "media",
 * file })`) UND den Admin-Direktupload. Er läuft in Payloads Create/Update-
 * Operation VOR `generateFileData` (verifiziert in payload@3.84.1), sodass das
 * Ersetzen von `req.file.data` von der weiteren Verarbeitung gesehen wird.
 *
 * Drei Schutzschichten:
 *   - Magic-Bytes (file-type): der TATSÄCHLICHE Inhalt muss ein erlaubtes
 *     Rasterformat sein — eine als `bild.png` getarnte HTML-/Polyglot-Datei
 *     wird abgelehnt (Extension/claimed-MIME wird nicht vertraut).
 *   - Raster-Re-Encode (sharp): JPEG/PNG/WebP/GIF werden neu kodiert und ihre
 *     Metadaten gestrippt → entfernt EXIF-/Polyglot-/Trailing-Payloads.
 *   - SVG-Sanitisierung (DOMPurify): script/on*-Handler/foreignObject etc.
 *     werden entfernt, bevor das SVG persistiert + same-origin ausgeliefert
 *     wird (Policy: SVG bleibt erlaubt, aber nur sanitisiert).
 */
import createDOMPurify from "dompurify";
import { fileTypeFromBuffer } from "file-type";
import { JSDOM } from "jsdom";
import type { CollectionBeforeOperationHook } from "payload";
import sharp from "sharp";

const RASTER_FORMAT = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
} as const;
type RasterMime = keyof typeof RASTER_FORMAT;

// DOMPurify braucht ein DOM; jsdom erst bei Bedarf (erstem SVG) konstruieren.
let _purify: ReturnType<typeof createDOMPurify> | null = null;
function purifier(): ReturnType<typeof createDOMPurify> {
  if (!_purify) {
    const { window } = new JSDOM("");
    // jsdom-Window ist DOM-kompatibel genug für DOMPurify.
    _purify = createDOMPurify(window as unknown as Window & typeof globalThis);
  }
  return _purify;
}

export function sanitizeSvg(input: Buffer): Buffer {
  const dirty = input.toString("utf8");
  const clean = purifier().sanitize(dirty, {
    USE_PROFILES: { svg: true, svgFilters: true },
    // script/on*-Handler entfernt DOMPurify per Default; foreignObject kann
    // HTML (inkl. Skripte) einschleusen → explizit verbieten.
    FORBID_TAGS: ["script", "foreignObject"],
  });
  if (!clean || !/<svg[\s>]/i.test(clean)) {
    throw new Error(
      "Asset-Validierung: SVG ungültig oder nach Sanitisierung leer",
    );
  }
  return Buffer.from(clean, "utf8");
}

export async function reencodeRaster(
  input: Buffer,
  mime: RasterMime,
): Promise<Buffer> {
  const animated = mime === "image/gif" || mime === "image/webp";
  try {
    // Kein withMetadata() → sharp strippt EXIF/ICC/XMP. rotate() nur für
    // statische Formate (orientiert anhand EXIF, das danach entfällt).
    let img = sharp(input, animated ? { animated: true } : {});
    if (!animated) img = img.rotate();
    switch (RASTER_FORMAT[mime]) {
      case "jpeg":
        return await img.jpeg().toBuffer();
      case "png":
        return await img.png().toBuffer();
      case "webp":
        return await img.webp().toBuffer();
      case "gif":
        return await img.gif().toBuffer();
    }
  } catch {
    throw new Error(`Asset-Validierung: Bild nicht dekodierbar (${mime})`);
  }
}

/**
 * Kern-Logik, Payload-frei und damit unit-testbar: prüft + härtet einen
 * Asset-Buffer und gibt den zu persistierenden Buffer + MIME zurück. Wirft
 * `Asset-Validierung: …` bei nicht erlaubtem/kaputtem Inhalt.
 */
export async function processAssetBuffer(
  input: Buffer,
  claimedMime: string | undefined,
  name: string | undefined,
): Promise<{ data: Buffer; mimeType: string }> {
  const claimed = (claimedMime ?? "").toLowerCase();
  const looksSvg = claimed === "image/svg+xml" || /\.svg$/i.test(name ?? "");

  if (looksSvg) {
    return { data: sanitizeSvg(input), mimeType: "image/svg+xml" };
  }

  const detected = await fileTypeFromBuffer(input);
  if (!detected || !(detected.mime in RASTER_FORMAT)) {
    throw new Error(
      `Asset-Validierung: Inhalt nicht als erlaubtes Bild erkannt ` +
        `(claimed: ${claimed || "?"}, erkannt: ${detected?.mime ?? "unbekannt"})`,
    );
  }
  const data = await reencodeRaster(input, detected.mime as RasterMime);
  return { data, mimeType: detected.mime };
}

/**
 * Payload-Hook: dünner Wrapper um processAssetBuffer. Greift nur bei
 * Create/Update mit echtem In-Memory-Buffer (die Media-Collection nutzt keine
 * temp-files → `req.file.data` ist gesetzt).
 */
export const sanitizeMediaUpload: CollectionBeforeOperationHook = async ({
  args,
  operation,
  req,
}) => {
  if (operation !== "create" && operation !== "update") return args;
  const file = req.file;
  if (!file || !Buffer.isBuffer(file.data) || file.data.length === 0) {
    return args;
  }

  const { data, mimeType } = await processAssetBuffer(
    file.data,
    file.mimetype,
    file.name,
  );
  file.data = data;
  file.size = data.length;
  file.mimetype = mimeType;
  // Falls je temp-files aktiviert würden: erzwingt den Buffer-Pfad downstream.
  file.tempFilePath = undefined;

  return args;
};

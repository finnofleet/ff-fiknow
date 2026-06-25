/**
 * Asset-Upload-Validierung + Staging (ADR 0004) — geteilt zwischen dem
 * MCP-Tool `upload_asset` (base64 im Tool-Argument) und dem HTTP-Endpoint
 * `POST /api/authoring/asset` (rohe Bytes per curl, out-of-band).
 *
 * Beide Pfade staffeln dasselbe Ergebnis: ein einzelnes Binär-Asset wird gegen
 * dieselbe Härtung geprüft (Pfad-Containment, Bild-Allowlist, Byte-Limit) und
 * content-adressiert in den Staging-Store gelegt; zurück kommt der `sha256`,
 * den der anschließende `import_course` als `{path, sha256}`-Referenz nutzt.
 *
 * Warum der HTTP-Pfad existiert: base64-im-Tool-Argument zwingt das *Modell*,
 * die Bytes als Token AUSZUGEBEN — für Clients mit Shell-/Netz-Zugriff
 * (local-agent-mode, CLI) ist das der falsche Weg; `curl --data-binary @file`
 * schickt die Bytes direkt, ohne dass sie je den Modell-Kontext berühren.
 */
import { MAX_STAGED_ASSET_BYTES, stageAsset } from "./asset-staging";
import { assertSafeEntryName } from "./zip";

// Erlaubte Binär-Asset-Typen (Bilder). SVG ist Text und geht über das
// Bundle-Text-File (`files[]`), gehört also bewusst NICHT hierher.
const ASSET_MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

/** Erwarteter MIME-Type für einen Asset-Pfad, oder `undefined` wenn nicht erlaubt. */
export function assetMimeForPath(p: string): string | undefined {
  const ext = p.split(".").pop()?.toLowerCase() ?? "";
  return ASSET_MIME_BY_EXT[ext];
}

/** Liste der erlaubten Extensions (für Fehlermeldungen). */
export const ALLOWED_ASSET_EXTS = Object.keys(ASSET_MIME_BY_EXT);

/** Validierungsfehler (Client-Input) → von HTTP auf 400, von MCP auf Tool-Error gemappt. */
export class AssetUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssetUploadError";
  }
}

/**
 * Prüft, dass `path` ein sicherer, erlaubter Binär-Asset-Pfad ist, und gibt den
 * erwarteten MIME-Type zurück. Wirft `AssetUploadError` bei Verstoß. Geteilt von
 * `validateAndStageAsset` (HTTP/MCP-Upload) und `request_asset_upload_url`
 * (Mint), damit dieselben Regeln gelten, bevor ein Upload-Token vergeben wird.
 */
export function assertValidAssetPath(path: string): string {
  try {
    assertSafeEntryName(path);
  } catch (err) {
    throw new AssetUploadError((err as Error).message);
  }
  if (!path.startsWith("assets/")) {
    throw new AssetUploadError(`Asset-Pfad muss unter "assets/" liegen: "${path}".`);
  }
  const mime = assetMimeForPath(path);
  if (!mime) {
    throw new AssetUploadError(
      `Nicht unterstützter Asset-Typ für "${path}". Erlaubt: ${ALLOWED_ASSET_EXTS.join(", ")}. (SVG → import_course files[].)`,
    );
  }
  return mime;
}

export type StagedAsset = {
  path: string;
  sha256: string;
  bytes: number;
  contentType: string;
};

/**
 * Prüft ein einzelnes Asset und legt es in den Staging-Store. Wirft
 * `AssetUploadError` bei jedem Validierungsverstoß (unsicherer/nicht unter
 * `assets/` liegender Pfad, nicht erlaubter Typ, leere/zu große Bytes,
 * contentType-Mismatch). Gibt bei Erfolg den `sha256` zurück.
 */
export async function validateAndStageAsset(args: {
  courseSlug: string;
  path: string;
  bytes: Buffer;
  contentType?: string;
}): Promise<StagedAsset> {
  const { courseSlug, path, bytes, contentType } = args;

  const mime = assertValidAssetPath(path);
  if (contentType && contentType !== mime) {
    throw new AssetUploadError(
      `contentType "${contentType}" passt nicht zur Extension (erwartet "${mime}").`,
    );
  }

  if (bytes.length === 0) {
    throw new AssetUploadError(`Leeres Asset für "${path}".`);
  }
  if (bytes.length > MAX_STAGED_ASSET_BYTES) {
    throw new AssetUploadError(
      `Asset zu groß (${bytes.length} > ${MAX_STAGED_ASSET_BYTES} Bytes). Größere Binärdateien über den ZIP-Upload-Pfad.`,
    );
  }

  const sha256 = await stageAsset(courseSlug, bytes);
  return { path, sha256, bytes: bytes.length, contentType: mime };
}

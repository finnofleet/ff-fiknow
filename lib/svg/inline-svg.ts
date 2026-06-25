/**
 * Lädt ein lokales, beim Upload bereits sanitisiertes SVG als Markup, um es
 * INLINE zu rendern (statt via <img>). Nur inline kann das SVG `currentColor`
 * + die Theme-CSS-Variablen der Seite nutzen → Diagramme passen sich Light/Dark
 * automatisch an (theme-adaptive Diagramme, ein Asset statt zwei).
 *
 * Defense-in-depth: das Markup wird vor dem Inline-Einsetzen NOCHMAL
 * DOMPurify-sanitisiert — gleiche Policy wie `payload/collections/media-
 * sanitize.ts` (svg + svgFilters erlaubt, script/foreignObject verboten).
 * Es werden NUR same-origin, root-relative Pfade aus `public/` gelesen, kein
 * Remote-Fetch. Schlägt etwas fehl → null, der Aufrufer fällt auf <img> zurück.
 *
 * Server-only (node:fs + jsdom). Wird ausschliesslich aus der Server-Component
 * `Figure` importiert, nie clientseitig.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";

let _purify: ReturnType<typeof createDOMPurify> | null = null;
function purifier(): ReturnType<typeof createDOMPurify> {
  if (!_purify) {
    const { window } = new JSDOM("");
    _purify = createDOMPurify(window as unknown as Window & typeof globalThis);
  }
  return _purify;
}

export function sanitizeSvgMarkup(svg: string): string | null {
  const clean = purifier().sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ["script", "foreignObject"],
  });
  if (!clean || !/<svg[\s>]/i.test(clean)) return null;
  return clean;
}

/** Mappt einen root-relativen src auf den Datei-Pfad unter public/ — oder null. */
function resolvePublicSvgPath(src: string): string | null {
  if (!src.startsWith("/") || src.includes("..")) return null;
  let rel: string | null = null;
  if (src.startsWith("/api/media/file/")) {
    const file = src.slice("/api/media/file/".length);
    if (!file || file.includes("/")) return null;
    rel = path.join("media", file);
  } else if (src.startsWith("/assets/") || src.startsWith("/media/")) {
    rel = src.slice(1);
  }
  if (!rel || !rel.toLowerCase().endsWith(".svg")) return null;
  const base = path.join(process.cwd(), "public");
  const full = path.resolve(base, rel);
  if (full !== base && !full.startsWith(base + path.sep)) return null;
  return full;
}

/**
 * Liest + sanitisiert ein lokales SVG für Inline-Rendering. Gibt null zurück,
 * wenn der src remote/kein-SVG ist oder das Lesen scheitert.
 */
export async function loadInlineSvg(
  src: string | undefined,
): Promise<string | null> {
  if (!src) return null;
  const file = resolvePublicSvgPath(src);
  if (!file) return null;
  try {
    const raw = await readFile(file, "utf8");
    return sanitizeSvgMarkup(raw);
  } catch {
    return null;
  }
}

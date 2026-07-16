import { mkdirSync } from "node:fs";

import type { CollectionConfig } from "payload";

import { anyoneCanRead, editorsOnly } from "../access/by-role";
import { sanitizeMediaUpload } from "./media-sanitize";

/**
 * Media-Storage-Verzeichnis. Default `public/media`. In Production auf ein
 * PERSISTENTES, für die Container-UID (1001) beschreibbares Verzeichnis zeigen
 * lassen — am einfachsten ein Unterordner des bereits durablen Bundle-Storage-
 * Volumes, z. B. `MEDIA_STORAGE_DIR=/app/bundle-storage/_media`. Dann liegt
 * Media auf demselben funktionierenden NFS-Volume wie der Bundle-Storage, ohne
 * separaten Mount/chown.
 *
 * Wichtig: Das Serving läuft über die Payload-Route `/api/media/file/<name>`
 * (der Import rewritet Asset-Pfade dorthin), NICHT über Next-Static `/media/`.
 * Deshalb ist der Ort von `staticDir` frei wählbar und NICHT an `/public`
 * gebunden.
 */
const MEDIA_STATIC_DIR =
  process.env.MEDIA_STORAGE_DIR?.trim() || "public/media";
try {
  // Best-effort: Verzeichnis sicherstellen (Upload-Adapter erwartet es).
  mkdirSync(MEDIA_STATIC_DIR, { recursive: true });
} catch {
  // existiert schon / wird vom Adapter angelegt — kein harter Fehler beim Boot.
}

/**
 * Bild- und Datei-Uploads.
 *
 * Storage (siehe MEDIA_STATIC_DIR oben):
 *   - Lokal/Default: public/media
 *   - Production: persistentes, beschreibbares Verzeichnis via
 *     MEDIA_STORAGE_DIR — am einfachsten ein Unterordner des Bundle-Storage-
 *     Volumes (z. B. /app/bundle-storage/_media). Ohne persistentes Ziel gehen
 *     Uploads beim Container-Neubau verloren.
 *   - Phase ≥ 2: ggf. Migration auf Object Storage (S3-Adapter)
 *
 * Serving: Dateien werden über die Payload-Route /api/media/file/<name>
 * ausgeliefert (der Bundle-Import rewritet Asset-Pfade dorthin) — NICHT über
 * Next-Static /media/. Der Speicherort ist daher von /public entkoppelt.
 */
export const Media: CollectionConfig = {
  slug: "media",
  admin: {
    useAsTitle: "alt",
    defaultColumns: ["filename", "alt", "mimeType", "filesize", "updatedAt"],
  },
  access: {
    // Media hat keine Drafts/_status → readPublishedOrEditor wäre kaputt für
    // Anon (siehe anyoneCanRead). Dateien sind via /media/<name> ohnehin
    // statisch öffentlich; der /api/media/file/-Endpoint muss konsistent sein.
    read: anyoneCanRead,
    create: editorsOnly,
    update: editorsOnly,
    delete: editorsOnly,
  },
  hooks: {
    // Asset-Content-Härtung VOR generateFileData (SECURITY_AUDIT 6–8):
    // Magic-Bytes-Prüfung, Raster-Re-Encode (Metadaten-Strip), SVG-
    // Sanitisierung. Deckt Bundle-Import UND Admin-Upload ab.
    beforeOperation: [sanitizeMediaUpload],
  },
  upload: {
    // Verzeichnis (env-konfigurierbar, siehe oben). Serving via Payload-Route
    // /api/media/file/<name> — daher unabhängig von /public.
    staticDir: MEDIA_STATIC_DIR,
    // Nur Bild-Formate zulassen. SVG ist erlaubt, wird aber serverseitig
    // sanitisiert (DOMPurify) — siehe media-sanitize.ts. Raster werden
    // re-encodiert; der claimed MIME wird nicht vertraut (Magic-Bytes).
    mimeTypes: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "image/svg+xml",
    ],
  },
  fields: [
    {
      name: "alt",
      type: "text",
      required: true,
      label: "Alt-Text (Pflicht — Barrierefreiheit)",
    },
    {
      name: "caption",
      type: "text",
      label: "Bildunterschrift (optional, falls als <Figure caption=...>)",
    },
  ],
};

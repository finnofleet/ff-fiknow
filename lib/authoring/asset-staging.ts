/**
 * Asset-Staging-Store (ADR 0004, Phase 1) — hash-adressierter Zwischenspeicher
 * für einzelne Binär-Assets, die per MCP `upload_asset` hochgeladen wurden.
 *
 * Hintergrund: MCP überträgt das Bundle als Text + Asset-MANIFEST (`{path,
 * sha256, bytes}`), NICHT mehr als base64-im-Kontext. Unveränderte Assets löst
 * der Import per Hash gegen das aktuell gespeicherte Bundle auf. Für den
 * seltenen Fall eines NEUEN/geänderten Bildes lädt der Client es einmal per
 * `upload_asset` hoch; die Bytes landen hier (content-adressiert), und der
 * anschließende `import_course` referenziert sie nur noch per Hash.
 *
 * Layout:
 *   ${BUNDLE_STORAGE_DIR}/.staging/<slug>/<sha256>
 *
 * Content-adressiert: derselbe Hash = derselbe Inhalt, Überschreiben ist
 * idempotent. Per Slug gescoped, damit Aufräumen eine natürliche Grenze hat.
 * Der Store ist bewusst „lose" — Einträge sind transient (überleben einen
 * Import nicht zwingend) und dürfen jederzeit gelöscht werden; verliert sich
 * ein Eintrag, lädt der Client das Asset einfach erneut hoch.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { bundleStorageRoot } from "./bundle-storage";

/**
 * Byte-Limit für ein einzelnes per `upload_asset` gestagtes Asset. Großzügig
 * für ein hochauflösendes Bild, aber klein genug, dass die base64-Repräsentation
 * (≈ +33 %) im Tool-Argument handhabbar bleibt. Größere Binärdateien gehören
 * über den ZIP-Upload-Pfad rein, nicht über ein MCP-Tool-Argument.
 */
export const MAX_STAGED_ASSET_BYTES = 10 * 1024 * 1024; // 10 MB

const SAFE_SLUG = /^[a-z0-9-]+$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;

/** SHA-256-Hex eines Buffers — dieselbe Adressierung wie im Asset-Manifest. */
export function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/** Verzeichnis des Staging-Stores für einen Kurs, mit Containment-Check. */
function stagingDir(slug: string): string {
  if (!SAFE_SLUG.test(slug)) {
    throw new Error(`Asset-Staging: ungültiger Slug "${slug}".`);
  }
  const root = bundleStorageRoot();
  const dir = path.resolve(root, ".staging", slug);
  if (!dir.startsWith(root + path.sep)) {
    throw new Error(`Asset-Staging: Pfad bricht aus dem Root aus: ${dir}`);
  }
  return dir;
}

function stagedFile(slug: string, sha256: string): string {
  if (!SHA256_HEX.test(sha256)) {
    throw new Error(`Asset-Staging: ungültiger SHA-256-Hash "${sha256}".`);
  }
  return path.join(stagingDir(slug), sha256);
}

/**
 * Legt ein Asset content-adressiert ab und gibt seinen SHA-256-Hex zurück (den
 * der Client als Asset-Referenz im Import verwendet). Idempotent: derselbe
 * Inhalt überschreibt sich selbst byte-gleich.
 */
export async function stageAsset(slug: string, bytes: Buffer): Promise<string> {
  const sha256 = sha256Hex(bytes);
  const target = stagedFile(slug, sha256);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
  return sha256;
}

/** Liest ein gestagtes Asset per Hash zurück; `null`, wenn nicht vorhanden. */
export async function getStagedAsset(
  slug: string,
  sha256: string,
): Promise<Buffer | null> {
  const target = stagedFile(slug, sha256);
  if (!existsSync(target)) return null;
  return readFile(target);
}

/**
 * Entfernt den gesamten Staging-Store eines Kurses. Best-effort-Aufräumen nach
 * einem erfolgreichen Import — die gestagten Bytes sind dann byte-treu im
 * Bundle-Storage angekommen und werden hier nicht mehr gebraucht.
 */
export async function clearStaging(slug: string): Promise<void> {
  await rm(stagingDir(slug), { recursive: true, force: true });
}

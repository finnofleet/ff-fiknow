/**
 * Bundle-Storage — die durable Source-of-Truth für Kurs-Content (ADR 0001).
 *
 * Modell: Das hochgeladene MDX-Bundle (course.mdx + section/lesson-MDX +
 * Assets) ist der WAHRE Content; Payload/Postgres ist der daraus generierte,
 * abfragbare INDEX. Dieses Modul legt das Bundle byte-treu auf einem
 * persistenten Dateibaum ab und liest es für den Export zurück.
 *
 * Layout:
 *   ${BUNDLE_STORAGE_DIR}/<slug>/<version>/<bundle-root-relativer-Pfad>
 *
 * Die `version` ist ein frisch gemintetes UUID-Token pro Upload (siehe
 * import.ts). Pro Upload landet das Bundle unter einem eigenen, kollisions-
 * freien <version>-Ordner — deshalb kann `deleteBundle` (Kompensation bei
 * fehlgeschlagenem DB-Index-Write) niemals einen fremden Stand treffen.
 *
 * Welche <version> die AKTUELLE ist, weiß der DB-Index (`courses.version`) —
 * nicht dieses Modul. Das ist Absicht: Storage hält den Content, der Index
 * zeigt darauf. Deshalb gibt es hier bewusst kein `listVersions`/`latest`.
 *
 * Betrieb: `BUNDLE_STORAGE_DIR` zeigt in Prod auf ein persistentes
 * Jelastic-Volume; ohne Env-Var landet alles unter `.bundle-storage/` im
 * Projekt-Root (Dev).
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { assertSafeEntryName } from "./zip";

// ============================================================
// Pfad-Auflösung
// ============================================================

/** Wurzelverzeichnis des Bundle-Storage (Env-konfiguriert, Dev-Fallback). */
export function bundleStorageRoot(): string {
  const configured = process.env.BUNDLE_STORAGE_DIR;
  if (configured && configured.trim().length > 0) {
    return path.resolve(configured.trim());
  }
  return path.join(process.cwd(), ".bundle-storage");
}

// Slug + Version sind Pfad-Segmente — strikt validieren, damit sie nicht aus
// dem Storage-Root ausbrechen können (Defense-in-Depth; beide kommen schon
// validiert/gemintet an).
const SAFE_SEGMENT = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

function assertSafeSegment(value: string, label: string): void {
  if (!SAFE_SEGMENT.test(value) || value.includes("..")) {
    throw new Error(`Bundle-Storage: unsicheres ${label}-Segment: "${value}"`);
  }
}

/** Absoluter Pfad zum <slug>/<version>-Ordner, mit Containment-Check. */
function versionDir(slug: string, version: string): string {
  assertSafeSegment(slug, "Slug");
  assertSafeSegment(version, "Version");
  const root = bundleStorageRoot();
  const dir = path.resolve(root, slug, version);
  if (dir !== root && !dir.startsWith(root + path.sep)) {
    throw new Error(`Bundle-Storage: Pfad bricht aus dem Root aus: ${dir}`);
  }
  return dir;
}

// ============================================================
// Schreiben
// ============================================================

/**
 * Legt ein Bundle byte-treu unter <slug>/<version>/ ab. `files` sind
 * bundle-root-relative Pfade → Buffer (genau die Map aus extractZipToMap).
 * Jeder Entry-Pfad wird gegen Zip-Slip-Tricks geprüft, bevor er geschrieben
 * wird (dieselbe Härtung wie beim ZIP-Entpacken).
 */
export async function putBundle(
  slug: string,
  version: string,
  files: Map<string, Buffer>,
): Promise<void> {
  const dir = versionDir(slug, version);
  for (const [relPath, content] of files.entries()) {
    assertSafeEntryName(relPath);
    const target = path.resolve(dir, relPath);
    if (!target.startsWith(dir + path.sep)) {
      throw new Error(`Bundle-Storage: Entry bricht aus: ${relPath}`);
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
}

// ============================================================
// Lesen
// ============================================================

/**
 * Liest ein gespeichertes Bundle zurück als Map<bundle-root-relativer-Pfad,
 * Buffer>. Gibt `null`, wenn für diese <slug>/<version> nichts abgelegt ist
 * (z. B. Alt-Kurs, der vor Einführung des Storage importiert wurde).
 */
export async function getBundle(
  slug: string,
  version: string,
): Promise<Map<string, Buffer> | null> {
  const dir = versionDir(slug, version);
  if (!existsSync(dir)) return null;

  const files = new Map<string, Buffer>();
  async function walk(absDir: string, relPrefix: string): Promise<void> {
    const entries = await readdir(absDir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(absDir, entry.name);
      const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(abs, rel);
      } else if (entry.isFile()) {
        files.set(rel, await readFile(abs));
      }
    }
  }
  await walk(dir, "");
  return files.size > 0 ? files : null;
}

// ============================================================
// Löschen (Kompensation)
// ============================================================

/**
 * Entfernt eine Bundle-Version wieder. Kompensations-Schritt, wenn der
 * DB-Index-Write nach dem Storage-Write fehlschlägt — so sieht der Client
 * nie eine Version, die der Index nicht kennt. Best-effort: ein Fehler beim
 * Aufräumen (verwaister Ordner) ist harmlos und darf den ursprünglichen
 * Fehler nicht verschlucken.
 */
export async function deleteBundle(
  slug: string,
  version: string,
): Promise<void> {
  const dir = versionDir(slug, version);
  await rm(dir, { recursive: true, force: true });
}

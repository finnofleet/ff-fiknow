#!/usr/bin/env node
/**
 * publish.mjs — packt einen Bundle-Folder zu ZIP.
 *
 * Diese Datei hat zwei Rollen:
 *
 * 1. **CLI** (`node publish.mjs <bundle> [--out <dir>]`): erzeugt
 *    `<slug>.zip` lokal — nützlich für Debugging, Inspektion oder den
 *    klassischen Browser-Upload als Fallback.
 * 2. **Library** (`import { bundleToZip } from "./publish.mjs"`):
 *    `client.mjs` nutzt sie, um den Bundle-Folder für den Direkt-Upload
 *    zur Plattform-API zu packen. Kein temporäres ZIP auf Disk nötig.
 *
 * Default output-dir (CLI): **Parent-Folder des Bundles**, sprich
 * Geschwister-Ordner. Beispiel: bei Bundle `~/courses/onboarding/`
 * landet das ZIP unter `~/courses/onboarding.zip`. So liegt das ZIP
 * genau dort, wo der User auch die MDX-Files editiert.
 *
 * Output (stdout, CLI): JSON mit Pfad zur erzeugten ZIP + Bundle-Summary.
 */
import { existsSync, statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import AdmZip from "adm-zip";

/**
 * Packt einen Bundle-Folder zu einem In-Memory-ZIP.
 *
 * Wirft, wenn der Folder nicht existiert, kein `course.mdx` enthält oder
 * der Folder-Name kein gültiger Slug ist. Aufrufer entscheidet, was mit
 * dem Buffer passiert (in-Memory POST, auf Disk schreiben, …).
 *
 * @param {string} bundlePath - Pfad zum Bundle-Folder (relativ oder absolut)
 * @returns {{ buffer: Buffer, courseSlug: string, fileCount: number, files: string[], absoluteBundle: string }}
 */
export function bundleToZip(bundlePath) {
  const absoluteBundle = resolve(bundlePath);

  if (!existsSync(absoluteBundle) || !statSync(absoluteBundle).isDirectory()) {
    throw new Error(
      `Bundle-Folder existiert nicht oder ist kein Ordner: ${absoluteBundle}`,
    );
  }

  const courseMdxPath = join(absoluteBundle, "course.mdx");
  if (!existsSync(courseMdxPath)) {
    throw new Error(`Kein course.mdx im Bundle-Root: ${courseMdxPath}`);
  }

  const courseSlug = basename(absoluteBundle);
  if (!/^[a-z0-9-]+$/.test(courseSlug)) {
    throw new Error(
      `Bundle-Folder-Name "${courseSlug}" ist kein gültiger Slug (a-z, 0-9, - erlaubt).`,
    );
  }

  const zip = new AdmZip();
  zip.addLocalFolder(absoluteBundle, courseSlug);
  const buffer = zip.toBuffer();

  const entries = zip.getEntries().filter((e) => !e.isDirectory);

  return {
    buffer,
    courseSlug,
    absoluteBundle,
    fileCount: entries.length,
    files: entries.map((e) => e.entryName),
  };
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ============================================================
// CLI — nur wenn direkt ausgeführt, nicht beim Importieren
// ============================================================

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  await runCli();
}

async function runCli() {
  const args = process.argv.slice(2);
  let bundlePath = null;
  let explicitOutputDir = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--out" && args[i + 1]) {
      explicitOutputDir = args[++i];
    } else if (!args[i].startsWith("--")) {
      bundlePath = args[i];
    }
  }

  if (!bundlePath) {
    console.error("Usage: node publish.mjs <bundle-folder> [--out <output-dir>]");
    process.exit(1);
  }

  let packed;
  try {
    packed = bundleToZip(bundlePath);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  const outputDir = explicitOutputDir
    ? resolve(explicitOutputDir)
    : dirname(packed.absoluteBundle);

  const outputPath = resolve(outputDir, `${packed.courseSlug}.zip`);
  await writeFile(outputPath, packed.buffer);

  const result = {
    ok: true,
    zipPath: outputPath,
    zipSize: packed.buffer.length,
    zipSizeHuman: formatBytes(packed.buffer.length),
    courseSlug: packed.courseSlug,
    fileCount: packed.fileCount,
    files: packed.files,
  };

  console.log(JSON.stringify(result, null, 2));
}

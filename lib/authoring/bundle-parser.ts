/**
 * Bundle-Parser: liest eine Bundle-Struktur (Filesystem oder In-Memory)
 * und gibt ein normalisiertes `ParsedBundle`-Objekt zurück.
 *
 * Eingangsform → normalisierte Output-Form:
 *   - `parseBundleFromFiles()`  — liest aus einer Map<path, Buffer>, wie
 *                                  sie z.B. nach ZIP-Extraktion entsteht
 *
 * Alle Validierung der
 * Frontmatter-Semantik passiert NICHT hier (Phase 2: bundle-schema.ts mit
 * Zod). Hier nur Struktur-Plausibilisierung (zwingende Files vorhanden,
 * Slug-Konventionen) und Fail-Fast bei kaputter Ordnerstruktur.
 */
import path from "node:path";
import matter from "gray-matter";

import type {
  Frontmatter,
  ParsedAsset,
  ParsedBundle,
  ParsedLesson,
  ParsedSection,
} from "./types";

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

const SLUG_REGEX = /^[a-z0-9-]+$/;
const ORDER_PREFIX_REGEX = /^(\d{2})-(.+)$/;

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

function inferMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

// VCS/Editor/OS-Metadateien, die nie als Medien-Asset hochgeladen werden sollen.
// .gitkeep hält leere Verzeichnisse in Git, .DS_Store/Thumbs.db stammen aus
// Finder/Explorer. Sonstige Dotfiles ebenfalls überspringen.
function isIgnoredAssetFile(basename: string): boolean {
  if (basename.startsWith(".")) return true;
  if (basename === "Thumbs.db" || basename === "desktop.ini") return true;
  return false;
}

function parseOrderPrefix(name: string): { orderIndex: number; rest: string } {
  const m = name.match(ORDER_PREFIX_REGEX);
  if (!m) {
    throw new Error(
      `Bundle-Parser: Name "${name}" hat kein 2-stelliges NN-Präfix (erwartet z.B. "01-foo").`,
    );
  }
  return { orderIndex: parseInt(m[1], 10), rest: m[2] };
}

function assertValidSlug(slug: string, context: string): void {
  if (!SLUG_REGEX.test(slug)) {
    throw new Error(
      `Bundle-Parser: Ungültiger Slug "${slug}" in ${context} (nur a-z, 0-9, -).`,
    );
  }
}

function parseFrontmatter(raw: string): { frontmatter: Frontmatter; body: string } {
  const parsed = matter(raw);
  return {
    frontmatter: parsed.data as Frontmatter,
    body: parsed.content.trim(),
  };
}

// ------------------------------------------------------------
// In-Memory-Variante (für HTTP-Upload nach ZIP-Extraktion)
// ------------------------------------------------------------

/**
 * Liest ein Bundle aus einer Map<relative-path, Buffer>. Map-Keys sind
 * POSIX-style-Pfade relativ zum Bundle-Root (also OHNE den `<course-slug>/`-
 * Prefix). Beispiel-Keys:
 *   - "course.mdx"
 *   - "01-einleitung/section.mdx"
 *   - "01-einleitung/01-willkommen.mdx"
 *   - "assets/images/foo.png"
 */
export function parseBundleFromFiles(
  courseSlug: string,
  files: Map<string, Buffer>,
): ParsedBundle {
  assertValidSlug(courseSlug, `Course-Slug "${courseSlug}"`);

  // course.mdx
  const courseBuf = files.get("course.mdx");
  if (!courseBuf) {
    throw new Error("Bundle-Parser: course.mdx fehlt im Bundle-Root.");
  }
  const course = parseFrontmatter(courseBuf.toString("utf8"));

  // Sections nach Ordnern gruppieren
  const sectionMap = new Map<string, Map<string, Buffer>>();
  const assetEntries: Array<{ key: string; buf: Buffer }> = [];

  for (const [key, buf] of files.entries()) {
    if (key === "course.mdx") continue;
    if (key.startsWith("assets/")) {
      const basename = path.posix.basename(key);
      if (isIgnoredAssetFile(basename)) continue;
      assetEntries.push({ key, buf });
      continue;
    }
    const parts = key.split("/");
    if (parts.length !== 2) {
      // Phase 1: nur eine Verschachtelungs-Ebene unterstützt
      continue;
    }
    const [sectionDir, fileName] = parts;
    if (!ORDER_PREFIX_REGEX.test(sectionDir)) continue;
    if (!fileName.endsWith(".mdx")) continue;
    if (!sectionMap.has(sectionDir)) sectionMap.set(sectionDir, new Map());
    sectionMap.get(sectionDir)!.set(fileName, buf);
  }

  const sections: ParsedSection[] = [];
  for (const sectionDir of [...sectionMap.keys()].sort()) {
    const { orderIndex, rest: sectionSlug } = parseOrderPrefix(sectionDir);
    assertValidSlug(sectionSlug, `Section "${sectionDir}"`);
    const filesInSection = sectionMap.get(sectionDir)!;

    let sectionFm: Frontmatter = { title: sectionSlug };
    const sectionBuf = filesInSection.get("section.mdx");
    if (sectionBuf) {
      sectionFm = parseFrontmatter(sectionBuf.toString("utf8")).frontmatter;
    }

    const lessons: ParsedLesson[] = [];
    const lessonFiles = [...filesInSection.keys()]
      .filter((f) => f !== "section.mdx")
      .sort();
    for (const fileName of lessonFiles) {
      const base = fileName.replace(/\.mdx$/, "");
      const { orderIndex: lessonOrder, rest: lessonSlug } = parseOrderPrefix(base);
      assertValidSlug(lessonSlug, `Lesson "${fileName}"`);
      const { frontmatter, body } = parseFrontmatter(
        filesInSection.get(fileName)!.toString("utf8"),
      );
      lessons.push({ slug: lessonSlug, orderIndex: lessonOrder, frontmatter, body });
    }

    sections.push({ slug: sectionSlug, orderIndex, frontmatter: sectionFm, lessons });
  }

  const assets: ParsedAsset[] = assetEntries.map(({ key, buf }) => ({
    relativePath: key,
    filename: path.posix.basename(key),
    content: buf,
    mimeType: inferMimeType(key),
  }));

  return { courseSlug, course, sections, assets };
}

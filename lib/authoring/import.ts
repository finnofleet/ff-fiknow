// @ts-nocheck
// Payload's create/update-Signaturen sind überladen (draft-Variante erwartet
// draft:true, non-draft erwartet ohne _status). Für diesen Import-Helper die
// Strenge ausgeschaltet — App-Code bleibt voll typgeprüft.

/**
 * Bundle-Importer: schreibt ein `ParsedBundle` (siehe types.ts) in die
 * Payload-Collections Course/Section/Lesson + Media.
 *
 * Zwei Entry-Points:
 *   - `importBundle(bundle, options?)`          — wenn Bundle schon geparsed ist
 *   - `importFromExtractedBundle(courseSlug, files, options?)` — für HTTP-Upload
 *
 * Verhalten:
 *   - Idempotent: bestehende Records (find by slug) werden geupdated, sonst created
 *   - Assets werden in Payload-Media-Collection hochgeladen, MDX-Bodys
 *     rewritten von `assets/...` → `/api/media/file/<filename>`
 *   - Im Bundle FEHLENDE Sections/Lessons werden NICHT gelöscht (Phase 1 — "Bundle adds + updates")
 *
 * Frontmatter-Mapping: snake_case → camelCase passend zum Payload-Schema.
 */
import { randomUUID } from "node:crypto";
import path from "node:path";

import {
  commitTransaction,
  getPayload,
  initTransaction,
  killTransaction,
} from "payload";

import { assertSafeMdx } from "../mdx/validate";
import { indexCourse } from "../rag/indexing";
import { clearStaging, getStagedAsset, sha256Hex } from "./asset-staging";
import { deleteBundle, getBundle, putBundle } from "./bundle-storage";
import { parseBundleFromFiles } from "./bundle-parser";
import { VersionConflictError } from "./errors";
import type {
  Frontmatter,
  ImportOptions,
  ImportSummary,
  ParsedAsset,
  ParsedBundle,
} from "./types";

// ============================================================
// Public Entry Points
// ============================================================

export async function importFromExtractedBundle(
  courseSlug: string,
  files: Map<string, Buffer>,
  options: ImportOptions = {},
): Promise<ImportSummary> {
  const bundle = parseBundleFromFiles(courseSlug, files);
  // Die entpackte ZIP-Map IST das Roh-Bundle → direkt als Source-of-Truth
  // in den Storage.
  return importBundle(bundle, { ...options, rawFiles: options.rawFiles ?? files });
}

/** Eine Asset-Referenz aus dem MCP-Import (Asset-by-Reference, ADR 0004). */
export type AssetRef = {
  /** Bundle-root-relativer Pfad, z. B. `assets/images/foo.png`. */
  path: string;
  /** SHA-256-Hex der Asset-Bytes (aus dem Export-Manifest). */
  sha256: string;
};

/** Eine Text-Datei aus dem MCP-Import (course.mdx, section/lesson-MDX, SVG …). */
export type TextFile = { path: string; text: string };

/**
 * Import-Einstiegspunkt für Asset-by-Reference (ADR 0004, Phase 1).
 *
 * Statt das ganze Bundle (inkl. unveränderter base64-Assets) durch den
 * Modell-Kontext zu schicken, überträgt der MCP-Client nur Text-Dateien plus
 * ein Asset-MANIFEST aus Hash-Referenzen. Hier werden die Hashes zu echten
 * Bytes aufgelöst — zuerst gegen den Staging-Store (frisch per `upload_asset`
 * hochgeladene Bilder), dann gegen das aktuell gespeicherte Bundle
 * (unveränderte Assets werden so NIE neu übertragen). Die so rekonstruierte
 * volle File-Map läuft danach durch dieselbe Pipeline wie der ZIP-Upload.
 */
export async function importFromTextAndAssetRefs(
  courseSlug: string,
  textFiles: TextFile[],
  assetRefs: AssetRef[],
  options: ImportOptions = {},
): Promise<ImportSummary> {
  const payload = options.payload ?? (await loadPayload());

  const files = new Map<string, Buffer>();
  for (const f of textFiles) {
    files.set(f.path, Buffer.from(f.text, "utf8"));
  }

  if (assetRefs.length > 0) {
    const byHash = await loadCurrentBundleByHash(payload, courseSlug);
    const unresolved: AssetRef[] = [];
    for (const ref of assetRefs) {
      const staged = await getStagedAsset(courseSlug, ref.sha256);
      const bytes = staged ?? byHash.get(ref.sha256);
      if (!bytes) {
        unresolved.push(ref);
        continue;
      }
      files.set(ref.path, bytes);
    }
    if (unresolved.length > 0) {
      const list = unresolved.map((r) => `${r.path} (${r.sha256})`).join(", ");
      throw new Error(
        `Asset-Validierung: ${unresolved.length} Asset-Referenz(en) nicht ` +
          `auflösbar: ${list}. Geänderte/neue Assets zuerst per upload_asset ` +
          `hochladen, dann mit der zurückgegebenen sha256 referenzieren.`,
      );
    }
  }

  const summary = await importFromExtractedBundle(courseSlug, files, options);
  // Erfolgreich importiert → gestagte Assets sind jetzt byte-treu im
  // Bundle-Storage. Den Staging-Store best-effort leeren (verwaiste Bytes
  // wären harmlos, aber unnötig).
  await clearStaging(courseSlug).catch(() => {});
  return summary;
}

/**
 * Baut einen Index `sha256 → Buffer` über die Dateien des aktuell gespeicherten
 * Bundles. Damit lösen sich unveränderte Asset-Referenzen ohne erneute
 * Übertragung auf. Leer, wenn der Kurs neu ist oder kein Bundle im Storage liegt.
 */
async function loadCurrentBundleByHash(
  payload: unknown,
  courseSlug: string,
): Promise<Map<string, Buffer>> {
  const byHash = new Map<string, Buffer>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = payload as any;
  const course = (
    await p.find({
      collection: "courses",
      where: { slug: { equals: courseSlug } },
      limit: 1,
      overrideAccess: true,
    })
  ).docs[0];
  const version = course && typeof course.version === "string" ? course.version : "";
  if (!version) return byHash;
  const bundle = await getBundle(courseSlug, version);
  if (!bundle) return byHash;
  for (const buf of bundle.values()) {
    byHash.set(sha256Hex(buf), buf);
  }
  return byHash;
}

export async function importBundle(
  bundle: ParsedBundle,
  options: ImportOptions = {},
): Promise<ImportSummary> {
  const payload = options.payload ?? (await loadPayload());

  // 0. Security-Boundary (ADR 0001): MDX ist Daten, nicht Code. Alle Bodies
  // werden gegen die gehärtete Pipeline validiert, BEVOR irgendetwas
  // persistiert (Assets/DB). Erster Verstoß wirft → nichts wird geschrieben.
  // Deckt alle drei Entry-Points ab (HTTP-Upload, Folder-Import, vorgeparst),
  // da sie alle hier münden.
  await assertSafeMdx(bundle.course.body, `${bundle.courseSlug}/course.mdx`);
  for (const section of bundle.sections) {
    for (const lesson of section.lessons) {
      await assertSafeMdx(lesson.body, `${section.slug}/${lesson.slug}.mdx`);
    }
  }

  const summary: ImportSummary = {
    courseId: 0,
    courseSlug: bundle.courseSlug,
    course: "created",
    version: "",
    sections: [],
    assets: [],
  };

  // 0b. Konflikt-Erkennung (ADR 0001, Konsequenz 1) — VOR jedem Asset-/DB-Write.
  // Self-Identifying Bundle: der Server hält pro Kurs ein Version-Token; der
  // Client schickt die beim Download erhaltene Version zurück. Weicht sie vom
  // aktuellen Server-Stand ab (jemand hat zwischenzeitlich hochgeladen) → 409
  // statt Last-Write-Wins. Fehlt die Version (Erst-Upload, lokales Skript,
  // Migration von Alt-Beständen ohne Token) → kein Konflikt; es wird eine
  // frische Version vergeben.
  const existing = (
    await payload.find({
      collection: "courses",
      where: { slug: { equals: bundle.courseSlug } },
      limit: 1,
      overrideAccess: true,
    })
  ).docs[0];

  const incomingVersion =
    typeof bundle.course.frontmatter.version === "string"
      ? bundle.course.frontmatter.version.trim()
      : "";
  const storedVersion =
    existing && typeof existing.version === "string" ? existing.version : "";

  if (
    existing &&
    incomingVersion &&
    storedVersion &&
    incomingVersion !== storedVersion
  ) {
    throw new VersionConflictError(
      bundle.courseSlug,
      incomingVersion,
      storedVersion,
    );
  }

  const newVersion = randomUUID();
  summary.version = newVersion;

  // Storage-Write ZUERST (ADR 0001): das Bundle byte-treu als Source-of-Truth
  // ablegen, BEVOR der DB-Index geschrieben wird. Schlägt der Index-Write
  // unten fehl, wird dieser Storage-Stand kompensierend wieder gelöscht.
  // Weil <newVersion> frisch gemintet ist, gehört der <version>-Ordner
  // exklusiv zu genau diesem Import-Versuch — die Kompensation trifft nie
  // einen fremden Stand.
  const hasRawFiles = !!options.rawFiles && options.rawFiles.size > 0;
  if (hasRawFiles) {
    await putBundle(bundle.courseSlug, newVersion, options.rawFiles!);
  }

  // DB-Index transaktional schreiben: alle Course/Section/Lesson/Asset-Writes
  // laufen in EINER Payload-Transaktion (req.transaction). Bricht irgendetwas
  // mittendrin, rollt Postgres den gesamten Index zurück (killTransaction) und
  // der Storage-Stand wird kompensiert — der Client sieht nie eine halbe
  // Version. Die `newVersion` geht erst nach erfolgreichem Commit raus.
  //
  // Cross-System-Realität: eine echte ACID-Transaktion über Storage UND
  // Postgres gibt es nicht. Postgres ist der Commit-Anker, der Storage-Write
  // wird über deleteBundle kompensiert. Einziger Restfall: Prozess-Tod
  // ZWISCHEN Commit und (nicht erreichter) Kompensation hinterlässt einen
  // verwaisten Storage-Ordner — harmlos, weil nie referenziert.
  const req: { payload: unknown; transaction?: unknown } = { payload };
  let useTx = false;

  try {
    const db = (payload as { db?: { beginTransaction?: unknown } }).db;
    if (typeof db?.beginTransaction === "function") {
      useTx = await initTransaction(req);
    }

    // 1. Assets uploaden (vor Lessons, weil wir die URL-Map dafür brauchen,
    // und vor dem Course-Write, weil das Cover-Bild eine Media-ID braucht).
    const assetUrlMap = new Map<string, string>();
    const assetIdMap = new Map<string, number>();
    if (!options.skipAssets) {
      for (const asset of bundle.assets) {
        const result = await upsertAsset(payload, asset, req);
        assetUrlMap.set(asset.relativePath, result.url);
        assetIdMap.set(asset.relativePath, result.id);
        summary.assets.push({
          relativePath: asset.relativePath,
          mediaId: result.id,
          action: result.action,
        });
      }
    }

    // 2. Course — IMMER als Draft importieren, unabhängig vom Frontmatter.
    // Begründung: Jede Upload-Aktion soll reviewbar sein. Editor klickt
    // explizit „Veröffentlichen" im Admin-UI (POST /api/authoring/publish)
    // wenn er fertig geprüft hat. Frontmatter `status: published` wird
    // bewusst ignoriert — ein einzelner Bundle-Upload soll nie etwas
    // sofort live schalten.
    const courseStatus = "draft" as const;

    // Cover-Bild: course.mdx-Frontmatter `cover: assets/...` referenziert ein
    // Bundle-Asset → mit dessen Media-Record verknüpfen. DETERMINISTISCH
    // (Bundle = Source of Truth): fehlt `cover` (oder ist unauflösbar) → Cover
    // wird ENTFERNT (null), nicht stehen gelassen — sonst zeigt ein Kurs, dem
    // man das Cover wieder genommen hat, ein verwaistes/kaputtes Bild statt des
    // Kachel-Fallbacks. (Anders als Sections/Lessons: ein Scalar-Ref zu löschen
    // verliert keinen Content.)
    const coverMediaId = resolveCoverMediaId(
      bundle.course.frontmatter,
      assetIdMap,
    );
    const courseData = mapCourseFields(
      bundle.courseSlug,
      bundle.course.frontmatter,
      courseStatus,
      coverMediaId,
    );
    courseData.version = newVersion;

    let courseId: number;
    if (existing) {
      const updated = await payload.update({
        collection: "courses",
        id: existing.id,
        data: courseData,
        overrideAccess: true,
        req,
      });
      courseId = updated.id as number;
      summary.course = "updated";
    } else {
      const created = await payload.create({
        collection: "courses",
        data: courseData,
        overrideAccess: true,
        req,
      });
      courseId = created.id as number;
      summary.course = "created";
    }
    summary.courseId = courseId;

    // 3. Sections + Lessons
    for (const section of bundle.sections) {
      const sectionData = mapSectionFields(section, courseId, courseStatus);
      const existingSection = await payload.find({
        collection: "sections",
        where: {
          and: [
            { course: { equals: courseId } },
            { slug: { equals: section.slug } },
          ],
        },
        limit: 1,
        overrideAccess: true,
        req,
      });

      let sectionId: number;
      let sectionAction: "created" | "updated";
      if (existingSection.docs[0]) {
        const updated = await payload.update({
          collection: "sections",
          id: existingSection.docs[0].id,
          data: sectionData,
          overrideAccess: true,
          req,
        });
        sectionId = updated.id as number;
        sectionAction = "updated";
      } else {
        const created = await payload.create({
          collection: "sections",
          data: sectionData,
          overrideAccess: true,
          req,
        });
        sectionId = created.id as number;
        sectionAction = "created";
      }

      const sectionSummary: ImportSummary["sections"][number] = {
        slug: section.slug,
        id: sectionId,
        action: sectionAction,
        lessons: [],
      };

      for (const lesson of section.lessons) {
        const rewrittenBody = rewriteAssetPaths(lesson.body, assetUrlMap);
        const lessonData = mapLessonFields(lesson, sectionId, courseStatus, rewrittenBody);

        const existingLesson = await payload.find({
          collection: "lessons",
          where: {
            and: [
              { section: { equals: sectionId } },
              { slug: { equals: lesson.slug } },
            ],
          },
          limit: 1,
          overrideAccess: true,
          req,
        });

        let lessonId: number;
        let lessonAction: "created" | "updated";
        if (existingLesson.docs[0]) {
          const updated = await payload.update({
            collection: "lessons",
            id: existingLesson.docs[0].id,
            data: lessonData,
            overrideAccess: true,
            req,
          });
          lessonId = updated.id as number;
          lessonAction = "updated";
        } else {
          const created = await payload.create({
            collection: "lessons",
            data: lessonData,
            overrideAccess: true,
            req,
          });
          lessonId = created.id as number;
          lessonAction = "created";
        }
        sectionSummary.lessons.push({
          slug: lesson.slug,
          id: lessonId,
          action: lessonAction,
        });
      }

      summary.sections.push(sectionSummary);
    }

    if (useTx) await commitTransaction(req);
  } catch (err) {
    if (useTx) await killTransaction(req);
    if (hasRawFiles) {
      // Kompensation: verwaisten Storage-Stand entfernen. Best-effort — ein
      // Fehler hier darf den ursprünglichen Fehler nicht verschlucken.
      await deleteBundle(bundle.courseSlug, newVersion).catch(() => {});
    }
    throw err;
  }

  // RAG-Index-Generierung (ADR 0003) — NACH dem Commit, best-effort: der
  // Content ist live, ein Index-Fehler darf den Upload nicht nachträglich
  // „scheitern" lassen. indexCourse schluckt Embedding-Fehler selbst (→ Kurs
  // wird needs_reindex), wir fangen hier zusätzlich DB-/Unerwartetes ab. Ein
  // verpasster Index wird per Re-Index-Trigger / Backfill nachgeholt.
  if (!options.skipIndexing) {
    try {
      await indexCourse({
        courseSlug: bundle.courseSlug,
        version: newVersion,
        lessons: bundle.sections.flatMap((section) =>
          section.lessons.map((lesson) => ({
            sectionSlug: section.slug,
            lessonSlug: lesson.slug,
            body: lesson.body,
          })),
        ),
      });
    } catch (err) {
      console.error(
        `[import] RAG-Index für ${bundle.courseSlug} fehlgeschlagen ` +
          `(Upload bleibt erfolgreich):`,
        (err as Error).message,
      );
    }
  }

  return summary;
}

// ============================================================
// Frontmatter → Payload Field Mapping
// ============================================================

function mapCourseFields(
  slug: string,
  fm: Frontmatter,
  status: "draft" | "published",
  coverMediaId?: number,
): Record<string, unknown> {
  const data: Record<string, unknown> = {
    title: fm.title,
    slug,
    subtitle: fm.subtitle,
    description: fm.description,
    category: fm.category,
    difficulty: fm.difficulty,
    estimatedMinutes: fm.estimated_minutes,
    _status: status,
  };
  if (fm.prerequisites) data.prerequisites = fm.prerequisites;
  if (fm.cover_alt) data.coverAlt = fm.cover_alt;
  // Deterministisch: gesetzt → verknüpfen, sonst explizit entfernen (null).
  data.coverImage = coverMediaId ?? null;
  return data;
}

/**
 * Löst das Cover-Frontmatter (`cover: assets/...`) gegen die hochgeladenen
 * Bundle-Assets zu einer Media-ID auf. Gibt `undefined`, wenn kein `cover`
 * gesetzt ist oder der Pfad kein Bundle-Asset trifft (dann bleibt das Cover
 * unverändert — siehe Aufrufstelle).
 */
function resolveCoverMediaId(
  fm: Frontmatter,
  assetIdMap: Map<string, number>,
): number | undefined {
  const raw = typeof fm.cover === "string" ? fm.cover.trim() : "";
  if (!raw) return undefined;
  const key = raw.replace(/^\.?\//, ""); // führendes "/" oder "./" entfernen
  const id = assetIdMap.get(key);
  if (id == null) {
    console.warn(
      `[import] cover "${raw}" referenziert kein Bundle-Asset ` +
        `(oder skipAssets aktiv) — Cover bleibt ungesetzt.`,
    );
    return undefined;
  }
  return id;
}

function mapSectionFields(
  section: { slug: string; orderIndex: number; frontmatter: Frontmatter },
  courseId: number,
  status: "draft" | "published",
): Record<string, unknown> {
  return {
    title: section.frontmatter.title ?? section.slug,
    slug: section.slug,
    course: courseId,
    orderIndex: section.orderIndex,
    description: section.frontmatter.description,
    _status: status,
  };
}

function mapLessonFields(
  lesson: { slug: string; orderIndex: number; frontmatter: Frontmatter },
  sectionId: number,
  status: "draft" | "published",
  body: string,
): Record<string, unknown> {
  const fm = lesson.frontmatter;
  return {
    title: fm.title,
    slug: lesson.slug,
    section: sectionId,
    orderIndex: lesson.orderIndex,
    type: fm.type ?? "reading",
    estimatedMinutes: fm.estimated_minutes,
    summary: fm.summary,
    body,
    passingScore: fm.passing_score,
    videoUrl: fm.video_url,
    transcript: fm.transcript,
    _status: status,
  };
}

// ============================================================
// Asset-Upload (Payload Media-Collection)
// ============================================================

async function upsertAsset(
  payload: unknown,
  asset: ParsedAsset,
  req?: unknown,
): Promise<{ id: number; url: string; action: "created" | "updated" }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = payload as any;

  // Hinweis: Media-Creates schreiben die DB-Zeile transaktional (req), die
  // physische Datei aber außerhalb der Transaktion (Payload-Upload-Handler).
  // Bei Rollback bleibt die Datei als Waise liegen (filename-gekeyed, wird beim
  // nächsten Upload überschrieben) — die DB-Zeile verschwindet korrekt.

  // Vorhandenes Media-File mit gleichem Filename suchen (Konvention: Filename ist eindeutig pro Plattform)
  const existing = await p.find({
    collection: "media",
    where: { filename: { equals: asset.filename } },
    limit: 1,
    overrideAccess: true,
    req,
  });

  const file = {
    data: asset.content,
    mimetype: asset.mimeType,
    name: asset.filename,
    size: asset.content.length,
  };

  if (existing.docs[0]) {
    const updated = await p.update({
      collection: "media",
      id: existing.docs[0].id,
      data: { alt: asset.filename }, // Alt-Text wird durch Figure-Component-Props gesetzt
      file,
      overrideAccess: true,
      req,
    });
    return {
      id: updated.id as number,
      url: updated.url ?? `/api/media/file/${asset.filename}`,
      action: "updated",
    };
  }

  const created = await p.create({
    collection: "media",
    data: { alt: asset.filename },
    file,
    overrideAccess: true,
    req,
  });
  return {
    id: created.id as number,
    url: created.url ?? `/api/media/file/${asset.filename}`,
    action: "created",
  };
}

// ============================================================
// Asset-Pfad-Rewriting im Lesson-Body
// ============================================================

/**
 * Ersetzt `assets/...`-Pfade im MDX-Body durch die echten Media-URLs. Behält
 * absolute Pfade (`/assets/...` oder `https://...`) unverändert.
 *
 * Behandelt zwei Pattern:
 *   - JSX-Attribute:  src="assets/images/foo.png"
 *   - Markdown-Image: ![](assets/images/foo.png)
 */
function rewriteAssetPaths(body: string, urlMap: Map<string, string>): string {
  if (urlMap.size === 0) return body;
  let result = body;
  for (const [relPath, newUrl] of urlMap.entries()) {
    const escaped = relPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // src="assets/..." oder src='assets/...'
    result = result.replace(
      new RegExp(`(src=)(['"])${escaped}\\2`, "g"),
      `$1$2${newUrl}$2`,
    );
    // ](assets/...) — Markdown-Image-Pattern
    result = result.replace(new RegExp(`\\]\\(${escaped}\\)`, "g"), `](${newUrl})`);
  }
  return result;
}

// ============================================================
// Payload-Instance laden (Lazy + Singleton)
// ============================================================

let _payload: unknown = null;
async function loadPayload() {
  if (_payload) return _payload;
  // Dynamic-Import vermeidet, dass payload.config.ts beim Modul-Load
  // ausgeführt wird (wichtig wenn dieser Helper aus dem Next-Edge-Runtime
  // o.ä. importiert wird).
  const { default: config } = await import("../../payload.config");
  _payload = await getPayload({ config });
  return _payload;
}

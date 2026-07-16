/**
 * Re-Index-Trigger + Backfill (ADR 0003, Entscheidung 4).
 *
 * Lädt die aktuellen Lektions-Bodies eines Kurses aus Payload (das ist, was
 * der Lerner sieht) und feuert `indexCourse`. Genutzt von:
 *   - dem Re-Index-Endpoint (POST /api/authoring/reindex),
 *   - dem Backfill (gleicher Endpoint ohne slug → alle Kurse).
 *
 * Bewusst draft-aware (`draft: true`): wir indexieren die NEUESTE Version
 * (`courses.version`), inkl. noch nicht publizierter Drafts — konsistent damit,
 * dass der Upload-Hook die frisch hochgeladene (Draft-)Version indexiert und
 * Kuratoren den Tutor im Learner-Shell auf Drafts nutzen.
 */
import { getPayload } from "payload";

import config from "@/payload.config";

import { type IndexResult, indexCourse, type IndexableLesson } from "./indexing";

// Payloads generierte Collection-Typen sind hier mehr Reibung als Nutzen
// (lose Felder, draft-Varianten) — wie im publish-Endpoint als `any` geführt.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPayload = any;

let _payload: AnyPayload = null;
async function loadPayload(): Promise<AnyPayload> {
  if (!_payload) _payload = await getPayload({ config });
  return _payload;
}

export interface ReindexCourseResult extends IndexResult {
  courseSlug: string;
}

/** Re-indexiert einen einzelnen Kurs aus dem aktuellen Payload-Stand. */
export async function reindexCourse(
  courseSlug: string,
  payloadArg?: AnyPayload,
): Promise<ReindexCourseResult> {
  const payload = payloadArg ?? (await loadPayload());

  const course = (
    await payload.find({
      collection: "courses",
      where: { slug: { equals: courseSlug } },
      draft: true,
      overrideAccess: true,
      limit: 1,
    })
  ).docs[0];
  if (!course) throw new Error(`Kurs "${courseSlug}" nicht gefunden`);

  const version = typeof course.version === "string" ? course.version : "";
  if (!version) {
    throw new Error(`Kurs "${courseSlug}" hat keine version — kann nicht versions-gekeyt indexieren`);
  }

  const sections = (
    await payload.find({
      collection: "sections",
      where: { course: { equals: course.id } },
      sort: "orderIndex",
      draft: true,
      overrideAccess: true,
      limit: 1000,
    })
  ).docs;

  const lessons: IndexableLesson[] = [];
  for (const section of sections) {
    const lessonDocs = (
      await payload.find({
        collection: "lessons",
        where: { section: { equals: section.id } },
        sort: "orderIndex",
        draft: true,
        overrideAccess: true,
        limit: 1000,
      })
    ).docs;
    for (const lesson of lessonDocs) {
      lessons.push({
        sectionSlug: section.slug as string,
        lessonSlug: lesson.slug as string,
        body: typeof lesson.body === "string" ? lesson.body : "",
      });
    }
  }

  const result = await indexCourse({ courseSlug, version, lessons });
  return { courseSlug, ...result };
}

/** Backfill: re-indexiert ALLE Kurse. Sequenziell, um den Embedding-Provider
 * nicht zu fluten. Ein Fehler bei einem Kurs stoppt nicht die übrigen. */
export async function reindexAllCourses(
  payloadArg?: AnyPayload,
): Promise<ReindexCourseResult[]> {
  const payload = payloadArg ?? (await loadPayload());

  const courses = (
    await payload.find({
      collection: "courses",
      draft: true,
      overrideAccess: true,
      limit: 1000,
      sort: "slug",
    })
  ).docs;

  const results: ReindexCourseResult[] = [];
  for (const course of courses) {
    const slug = course.slug as string;
    try {
      results.push(await reindexCourse(slug, payload));
    } catch (err) {
      results.push({
        courseSlug: slug,
        status: "needs_reindex",
        chunkCount: 0,
        reason: (err as Error).message,
      });
    }
  }
  return results;
}

/**
 * Lernpfad-Layer für Frontend-Reads.
 *
 * Quelle: Payload CMS Local API (kein HTTP-Hop, type-safe) — wie lib/content.ts.
 * Ein Lernpfad referenziert Kurse per Slug; aufgelöst wird gegen lib/content.ts
 * (listCourseSummaries / getCourse). Reine Reads, kein Schreibpfad.
 *
 * Draft-Sichtbarkeit (analog lib/content.ts): Default liefert nur published
 * (`overrideAccess:false` → readPublishedOrEditor mit user=undefined). Mit
 * `includeDrafts` (nur nach Rollen-Check via viewerCanSeeDrafts()) kommen auch
 * Draft-Pfade — damit Autoren/Admins einen Pfad vor dem Publish im echten
 * Learner-Shell testen können.
 *
 * Member-Kurse werden gegen die PUBLISHED-Kursliste aufgelöst — ein im Pfad
 * referenzierter, (noch) nicht published Kurs kommt als `course: null` zurück;
 * die UI zeigt ihn dann gedimmt als „nicht verfügbar".
 */
import { getPayload } from "payload";
import config from "@payload-config";

import type { CourseSummary, ReadOptions } from "./content";
import { listCourseSummaries } from "./content";

export type PathRole = "required" | "recommended" | "optional";
export type Fuehrungsgrad = "linear" | "lose";
export type PathStatus = "draft" | "published";

export type LearningPathSummary = {
  slug: string;
  title: string;
  subtitle?: string;
  description?: string;
  coverImageUrl?: string;
  fuehrungsgrad: Fuehrungsgrad;
  status: PathStatus;
  courseCount: number;
};

export type LearningPathCourse = {
  courseSlug: string;
  role: PathRole;
  /** Aufgelöster Kurs; null, wenn der referenzierte Kurs fehlt / nicht published. */
  course: CourseSummary | null;
};

export type LearningPath = {
  slug: string;
  title: string;
  subtitle?: string;
  description?: string;
  coverImageUrl?: string;
  fuehrungsgrad: Fuehrungsgrad;
  status: PathStatus;
  courses: LearningPathCourse[];
};

// Payload-Wrapper (Singleton) — analog lib/content.ts.
let _payloadPromise: ReturnType<typeof getPayload> | null = null;
function payload() {
  if (!_payloadPromise) _payloadPromise = getPayload({ config });
  return _payloadPromise;
}

/**
 * Draft-Sichtbarkeit für `find` — 1:1 das Muster aus lib/content.ts:
 *   - Default: overrideAccess:false → published-only (readPublishedOrEditor).
 *   - includeDrafts: draft:true + overrideAccess:true → neueste Version inkl. Draft.
 */
function draftQuery(opts?: ReadOptions): { draft?: true; overrideAccess: boolean } {
  return opts?.includeDrafts
    ? { draft: true, overrideAccess: true }
    : { overrideAccess: false };
}

function statusOf(d: unknown): PathStatus {
  return (d as { _status?: unknown })._status === "published"
    ? "published"
    : "draft";
}

/**
 * Löst ein populiertes Upload-Feld (Media-Doc) zu seiner URL auf — deckungs-
 * gleich mit lib/content.ts.resolveMediaUrl.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveMediaUrl(media: any): string | undefined {
  if (!media || typeof media !== "object") return undefined;
  if (typeof media.url === "string" && media.url) return media.url;
  if (typeof media.filename === "string" && media.filename) {
    return `/api/media/file/${media.filename}`;
  }
  return undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rawCourseRefs(d: any): { courseSlug: string; role: PathRole }[] {
  const arr: unknown[] = Array.isArray(d.courses) ? d.courses : [];
  return arr
    .map((row) => {
      const r = (row ?? {}) as { courseSlug?: unknown; role?: unknown };
      return {
        courseSlug: typeof r.courseSlug === "string" ? r.courseSlug : "",
        role: (r.role as PathRole) ?? "required",
      };
    })
    .filter((row) => row.courseSlug.length > 0);
}

/**
 * Billiger Existenz-Check (ein SQL-COUNT, keine Doc-Fetches) — für das Gaten
 * des „Pfade"-Nav-Links: der Eintrag erscheint erst, wenn ≥1 sichtbarer Pfad
 * existiert. Für Editoren (includeDrafts) zählen auch Drafts mit.
 */
export async function countPaths(opts?: ReadOptions): Promise<number> {
  const p = await payload();
  const { totalDocs } = await p.count({
    collection: "learning-paths",
    overrideAccess: Boolean(opts?.includeDrafts),
  });
  return totalDocs;
}

export async function listPaths(opts?: ReadOptions): Promise<LearningPathSummary[]> {
  const p = await payload();
  const result = await p.find({
    collection: "learning-paths",
    limit: 1000,
    sort: "title",
    ...draftQuery(opts),
  });

  return result.docs.map((d) => ({
    slug: (d.slug as string) ?? "",
    title: (d.title as string) ?? "",
    subtitle: (d.subtitle as string) ?? undefined,
    description: (d.description as string) ?? undefined,
    coverImageUrl: resolveMediaUrl(d.coverImage),
    fuehrungsgrad: ((d.fuehrungsgrad as Fuehrungsgrad) ?? "linear") as Fuehrungsgrad,
    status: statusOf(d),
    courseCount: rawCourseRefs(d).length,
  }));
}

export async function getPath(
  slug: string,
  opts?: ReadOptions,
): Promise<LearningPath | null> {
  const p = await payload();
  const result = await p.find({
    collection: "learning-paths",
    where: { slug: { equals: slug } },
    limit: 1,
    ...draftQuery(opts),
  });
  const doc = result.docs[0];
  if (!doc) return null;

  // Kurse einmal laden und per Slug indexieren (statt N Einzel-Queries).
  const summaries = await listCourseSummaries();
  const bySlug = new Map(summaries.map((c) => [c.slug, c]));

  const courses: LearningPathCourse[] = rawCourseRefs(doc).map((ref) => ({
    courseSlug: ref.courseSlug,
    role: ref.role,
    course: bySlug.get(ref.courseSlug) ?? null,
  }));

  return {
    slug: (doc.slug as string) ?? "",
    title: (doc.title as string) ?? "",
    subtitle: (doc.subtitle as string) ?? undefined,
    description: (doc.description as string) ?? undefined,
    coverImageUrl: resolveMediaUrl(doc.coverImage),
    fuehrungsgrad: ((doc.fuehrungsgrad as Fuehrungsgrad) ?? "linear") as Fuehrungsgrad,
    status: statusOf(doc),
    courses,
  };
}

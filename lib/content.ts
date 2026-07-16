/**
 * Content-Layer für Frontend-Reads.
 *
 * Quelle: Payload CMS Local API (kein HTTP-Hop, type-safe).
 * Zielformat: bewusst dieselben Types wie das vorherige fs/MDX-basierte
 * Modul (siehe content-fs.ts.deprecated), damit App-Pages und
 * Components ohne Anpassung weiterlaufen.
 *
 * Mapping Payload → Domain-Types:
 *
 *   Payload.Course.title         → Course.frontmatter.title
 *   Payload.Course.estimatedMinutes → Course.frontmatter.estimated_minutes
 *   Payload.Section.orderIndex   → Section.order
 *   Payload.Lesson.body          → Lesson.body (1:1, MDX)
 *   ...
 *
 * Hinweise:
 *   - Course/Section haben in Payload (Phase 1) noch kein `body`-Feld.
 *     Wir liefern leeren String — `course.body` wird in
 *     `app/(frontend)/courses/[slug]/page.tsx` als optionale Lede genutzt
 *     und einfach ausgeblendet.
 *   - Drafts werden NICHT ausgeliefert: Payload's Default-Access
 *     ohne req filtert auf `_status: 'published'` für anonyme Calls.
 *   - prev/next-Navigation wird hier flach über alle Lessons des Kurses
 *     berechnet (gleich wie im fs-basierten Original).
 */
import { getPayload } from "payload";
import config from "@payload-config";

// ============================================================
// Public Types — bleiben kompatibel zum fs-basierten Vorgänger.
// ============================================================

export type LessonType = "reading" | "video" | "quiz";

export type CourseFrontmatter = {
  title: string;
  subtitle?: string;
  description?: string;
  category?: string;
  difficulty?: "einsteiger" | "mittel" | "fortgeschritten";
  estimated_minutes?: number;
  status?: "draft" | "published";
  cover_alt?: string;
  /**
   * Aufgelöste URL des Kurs-Cover-Bilds (aus `courses.coverImage` → Media).
   * Leer, wenn der Kurs kein Cover hat → Frontend fällt auf den
   * typografischen Kachel-Platzhalter zurück. KEIN Roh-Frontmatter, sondern
   * serverseitig aufgelöst — das Bundle referenziert das Cover als
   * `cover: assets/...`, der Import verknüpft es mit der Media-Collection.
   */
  coverImageUrl?: string;
  prerequisites?: string;
  /** KI-Tutor für diesen Kurs freigeschaltet (ADR 0002, Gating). */
  tutor_enabled?: boolean;
  /** Bundle-Konflikt-Token (ADR 0001) — dient als bundle_version-Anker. */
  version?: string;
};

export type SectionFrontmatter = {
  title: string;
  description?: string;
};

export type LessonFrontmatter = {
  title: string;
  type: LessonType;
  estimated_minutes?: number;
  summary?: string;
  video_url?: string;
  transcript?: string;
  passing_score?: number;
};

export type Course = {
  slug: string;
  frontmatter: CourseFrontmatter;
  body: string;
  sections: Section[];
};

export type Section = {
  slug: string;
  order: number;
  frontmatter: SectionFrontmatter;
  body: string;
  lessons: LessonRef[];
};

export type LessonRef = {
  slug: string;
  order: number;
  frontmatter: LessonFrontmatter;
};

export type Lesson = LessonRef & {
  body: string;
  course: Course;
  section: Section;
  prev: LessonNeighbor | null;
  next: LessonNeighbor | null;
};

export type LessonNeighbor = {
  courseSlug: string;
  sectionSlug: string;
  lessonSlug: string;
  title: string;
};

// ============================================================
// Payload-Wrapper (Singleton) — der Local-API-Call ist günstig,
// aber jeder getPayload() initialisiert sonst die Engine neu.
// ============================================================

let _payloadPromise: ReturnType<typeof getPayload> | null = null;
function payload() {
  if (!_payloadPromise) _payloadPromise = getPayload({ config });
  return _payloadPromise;
}

// ============================================================
// Public API
// ============================================================

/**
 * Lese-Optionen. `includeDrafts` schaltet Draft-Inhalte frei (ADR 0002-Nachtrag:
 * Kuratoren öffnen Draft-Kurse im echten Lerner-Shell statt im Preview).
 *
 * SICHERHEIT — WICHTIG: Payloads Local-API-`find` hat `overrideAccess: true`
 * als DEFAULT, überspringt also die Collection-Access-Funktion
 * (readPublishedOrEditor). Ohne explizites `overrideAccess: false` kämen darum
 * AUCH Drafts an Anon/Learner zurück (Draft-Leak!). Deshalb:
 *   - Default (kein includeDrafts): `overrideAccess: false` → readPublished-
 *     OrEditor greift mit user=undefined → `_status = published` → published-only.
 *   - includeDrafts (nur nach Rollen-Check via viewerCanSeeDrafts()):
 *     `draft: true` + `overrideAccess: true` → liefert die neueste Version
 *     inkl. Drafts.
 */
export type ReadOptions = { includeDrafts?: boolean };

function draftQuery(opts?: ReadOptions): {
  draft?: true;
  overrideAccess: boolean;
} {
  return opts?.includeDrafts
    ? { draft: true, overrideAccess: true }
    : { overrideAccess: false };
}

export async function listCourses(opts?: ReadOptions): Promise<Course[]> {
  const p = await payload();
  const result = await p.find({
    collection: "courses",
    limit: 1000,
    sort: "title",
    ...draftQuery(opts),
  });

  const courses = await Promise.all(
    result.docs.map((c) => buildCourseFromDoc(c, opts)),
  );
  return courses;
}

export type CourseSummary = {
  slug: string;
  frontmatter: CourseFrontmatter;
};

/**
 * Leichtgewichtige Variante: nur Course-Felder, keine Sections/Lessons.
 * Eine Query, ideal für Übersichten wie Hero-Tiles oder Sidebars.
 */
export async function listCourseSummaries(
  opts?: ReadOptions,
): Promise<CourseSummary[]> {
  const p = await payload();
  const result = await p.find({
    collection: "courses",
    limit: 1000,
    sort: "title",
    ...draftQuery(opts),
  });
  return result.docs.map((c) => ({
    slug: (c.slug as string) ?? "",
    frontmatter: courseFrontmatterFromDoc(c),
  }));
}

export async function getCourse(
  courseSlug: string,
  opts?: ReadOptions,
): Promise<Course | null> {
  const p = await payload();
  const result = await p.find({
    collection: "courses",
    where: { slug: { equals: courseSlug } },
    limit: 1,
    ...draftQuery(opts),
  });

  const courseDoc = result.docs[0];
  if (!courseDoc) return null;

  return buildCourseFromDoc(courseDoc, opts);
}

export async function getLesson(
  courseSlug: string,
  sectionSlug: string,
  lessonSlug: string,
  opts?: ReadOptions,
): Promise<Lesson | null> {
  const course = await getCourse(courseSlug, opts);
  if (!course) return null;

  const section = course.sections.find((s) => s.slug === sectionSlug);
  if (!section) return null;

  const lessonRef = section.lessons.find((l) => l.slug === lessonSlug);
  if (!lessonRef) return null;

  // Body separat laden — er ist nicht in den nested LessonRefs enthalten.
  const p = await payload();
  const result = await p.find({
    collection: "lessons",
    where: {
      and: [
        { slug: { equals: lessonSlug } },
        { "section.slug": { equals: sectionSlug } },
      ],
    },
    limit: 1,
    ...draftQuery(opts),
  });
  const lessonDoc = result.docs[0];
  const body = (lessonDoc?.body as string | null | undefined) ?? "";

  // prev/next über alle Lessons des Kurses, in Section→Lesson-Reihenfolge.
  const flat: LessonNeighbor[] = course.sections.flatMap((s) =>
    s.lessons.map((l) => ({
      courseSlug,
      sectionSlug: s.slug,
      lessonSlug: l.slug,
      title: l.frontmatter.title,
    })),
  );
  const idx = flat.findIndex(
    (n) => n.sectionSlug === sectionSlug && n.lessonSlug === lessonSlug,
  );
  const prev = idx > 0 ? flat[idx - 1] : null;
  const next = idx >= 0 && idx < flat.length - 1 ? flat[idx + 1] : null;

  return { ...lessonRef, body, course, section, prev, next };
}

// ============================================================
// Internal: Mapping Payload-Doc → Domain-Course (mit nested Sections + Lessons)
// ============================================================

async function buildCourseFromDoc(
  courseDoc: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  opts?: ReadOptions,
): Promise<Course> {
  const p = await payload();

  const sectionsResult = await p.find({
    collection: "sections",
    where: { course: { equals: courseDoc.id } },
    sort: "orderIndex",
    limit: 1000,
    ...draftQuery(opts),
  });

  const sections: Section[] = await Promise.all(
    sectionsResult.docs.map(async (sectionDoc) => {
      const lessonsResult = await p.find({
        collection: "lessons",
        where: { section: { equals: sectionDoc.id } },
        sort: "orderIndex",
        limit: 1000,
        ...draftQuery(opts),
      });

      const lessons: LessonRef[] = lessonsResult.docs.map((lessonDoc) => ({
        slug: (lessonDoc.slug as string) ?? "",
        order: (lessonDoc.orderIndex as number) ?? 0,
        frontmatter: lessonFrontmatterFromDoc(lessonDoc),
      }));

      return {
        slug: (sectionDoc.slug as string) ?? "",
        order: (sectionDoc.orderIndex as number) ?? 0,
        frontmatter: {
          title: (sectionDoc.title as string) ?? "",
          description: (sectionDoc.description as string) ?? undefined,
        },
        body: "",
        lessons,
      } satisfies Section;
    }),
  );

  return {
    slug: (courseDoc.slug as string) ?? "",
    frontmatter: courseFrontmatterFromDoc(courseDoc),
    body: "",
    sections,
  };
}

/**
 * Löst ein populiertes Upload-Feld (Media-Doc) zu seiner URL auf. `.url` ist
 * der Normalfall; Fallback auf den kanonischen `/api/media/file/<filename>`-
 * Pfad (deckungsgleich mit upsertAsset). `undefined`, wenn nicht populiert
 * (Depth 0 → nur id) oder kein Cover gesetzt.
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
function courseFrontmatterFromDoc(d: any): CourseFrontmatter {
  return {
    title: (d.title as string) ?? "",
    subtitle: (d.subtitle as string) ?? undefined,
    description: (d.description as string) ?? undefined,
    category: (d.category as string) ?? undefined,
    difficulty: (d.difficulty as CourseFrontmatter["difficulty"]) ?? undefined,
    estimated_minutes: (d.estimatedMinutes as number) ?? undefined,
    cover_alt: (d.coverAlt as string) ?? undefined,
    // coverImage ist ein Upload-Feld → bei Payload-Default-Depth (2) als
    // Media-Doc populiert (mit .url). Fallback auf den kanonischen Media-Pfad
    // (wie upsertAsset) falls .url fehlt; bei Depth 0 (nur id) → kein Cover.
    coverImageUrl: resolveMediaUrl(d.coverImage),
    prerequisites: (d.prerequisites as string) ?? undefined,
    status:
      (d._status as CourseFrontmatter["status"]) ??
      (d.status as CourseFrontmatter["status"]) ??
      undefined,
    tutor_enabled: Boolean(d.tutorEnabled),
    version: (d.version as string) ?? undefined,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lessonFrontmatterFromDoc(d: any): LessonFrontmatter {
  return {
    title: (d.title as string) ?? "",
    type: ((d.type as LessonType) ?? "reading") as LessonType,
    estimated_minutes: (d.estimatedMinutes as number) ?? undefined,
    summary: (d.summary as string) ?? undefined,
    video_url: (d.videoUrl as string) ?? undefined,
    transcript: (d.transcript as string) ?? undefined,
    passing_score: (d.passingScore as number) ?? undefined,
  };
}

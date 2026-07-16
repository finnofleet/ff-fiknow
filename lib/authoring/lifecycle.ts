/**
 * Course-Lifecycle via Payload Local API — Single Source of Truth für
 * publish / unpublish / delete / tutor-toggle.
 *
 * Bewusst Local API (NICHT Drizzle): Courses/Sections/Lessons sind versioniert
 * (`versions.drafts`), publish/unpublish läuft über `_status` und Payloads
 * Draft-Maschinerie. Drizzle würde die Versions-Tabellen umgehen.
 *
 * Aufrufer:
 *   - `/manage/courses` Server-Actions (UI-Fassade, Schritt A)
 *   - `POST /api/authoring/publish` (Plugin/CLI-Publish, teilt sich
 *     `publishCourseCascade`)
 *
 * Auth ist NICHT hier — jeder Aufrufer macht seinen eigenen Rollen-Check
 * (requireCurator in den Actions, authenticateAuthoring im Endpoint). Diese
 * Funktionen laufen alle mit `overrideAccess: true` und vertrauen dem Caller.
 */
import { getPayload } from "payload";

import payloadConfig from "@/payload.config";

import { deleteBundle } from "./bundle-storage";
import { type PathInputRaw, validatePathInput } from "./validate-path-input";

// Payload-Typen sind hier bewusst lose — die Local-API-Generics sind im
// Projekt nicht durchgezogen (vgl. publish/route.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPayload = any;

async function client(): Promise<AnyPayload> {
  return (await getPayload({ config: payloadConfig })) as AnyPayload;
}

export type CourseStatus = "draft" | "published";

export type ManagedCourse = {
  id: number;
  title: string;
  slug: string;
  status: CourseStatus;
  tutorEnabled: boolean;
  version: string | null;
};

/**
 * Alle Kurse für die Verwaltungs-Liste — inkl. Drafts. Läuft mit
 * `overrideAccess: true`; der Zugriffsschutz sitzt im `/manage`-Layout +
 * pro Action. NICHT für öffentliche Reads verwenden (siehe lib/content.ts).
 */
export async function listManagedCourses(): Promise<ManagedCourse[]> {
  const payload = await client();
  const result = await payload.find({
    collection: "courses",
    limit: 1000,
    sort: "title",
    depth: 0,
    draft: true,
    overrideAccess: true,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return result.docs.map((c: any) => ({
    id: c.id as number,
    title: (c.title as string) ?? "",
    slug: (c.slug as string) ?? "",
    status: c._status === "published" ? "published" : "draft",
    tutorEnabled: Boolean(c.tutorEnabled),
    version: (c.version as string) ?? null,
  }));
}

export type PublishCascadeResult = { sections: number; lessons: number };

/**
 * Schaltet einen Kurs (und per Default alle Sections + Lessons) auf
 * `_status: "published"`. Ohne die Kinder wäre der Kurs zwar published, aber
 * Sections/Lessons blieben draft → auf der Frontend-Page unsichtbar.
 */
export async function publishCourseCascade(
  courseId: number,
  includeChildren = true,
): Promise<PublishCascadeResult> {
  const payload = await client();

  await payload.update({
    collection: "courses",
    id: courseId,
    data: { _status: "published" },
    overrideAccess: true,
  });

  const children: PublishCascadeResult = { sections: 0, lessons: 0 };
  if (!includeChildren) return children;

  const sections = await payload.find({
    collection: "sections",
    where: { course: { equals: courseId } },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
    draft: true,
  });
  for (const section of sections.docs) {
    await payload.update({
      collection: "sections",
      id: section.id,
      data: { _status: "published" },
      overrideAccess: true,
    });
    children.sections += 1;

    const lessons = await payload.find({
      collection: "lessons",
      where: { section: { equals: section.id } },
      limit: 1000,
      depth: 0,
      overrideAccess: true,
      draft: true,
    });
    for (const lesson of lessons.docs) {
      await payload.update({
        collection: "lessons",
        id: lesson.id,
        data: { _status: "published" },
        overrideAccess: true,
      });
      children.lessons += 1;
    }
  }

  return children;
}

/**
 * Nimmt einen Kurs vom Netz: `_status: "draft"`. Der Public-Read
 * (`readPublishedOrEditor`, overrideAccess:false) filtert hart auf
 * `_status = published`, darum reicht der Kurs allein — er ist dann nicht
 * mehr auffindbar, und weil getLesson() zuerst getCourse() macht, sind auch
 * alle Lessons unerreichbar. Kinder bleiben published → Re-Publish ist sofort
 * wieder live, ohne erneute Kaskade.
 */
export async function unpublishCourse(courseId: number): Promise<void> {
  const payload = await client();
  await payload.update({
    collection: "courses",
    id: courseId,
    data: { _status: "draft" },
    overrideAccess: true,
  });
}

/**
 * Löscht einen Kurs samt allen Sections + Lessons. Payload kaskadiert
 * Relationship-Deletes NICHT automatisch → manuell Lessons → Sections →
 * Course. Räumt zusätzlich das byte-treu gespeicherte Bundle der aktuellen
 * Version weg (best-effort; ältere Versionen sind nicht im DB-Index verlinkt).
 */
export async function deleteCourseCascade(courseId: number): Promise<void> {
  const payload = await client();

  // Slug + Version vorab lesen, fürs Bundle-Cleanup nach dem DB-Delete.
  let slug: string | null = null;
  let version: string | null = null;
  try {
    const course = await payload.findByID({
      collection: "courses",
      id: courseId,
      draft: true,
      overrideAccess: true,
    });
    slug = (course?.slug as string) ?? null;
    version = (course?.version as string) ?? null;
  } catch {
    // Kurs schon weg — nichts zu tun.
  }

  const sections = await payload.find({
    collection: "sections",
    where: { course: { equals: courseId } },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
    draft: true,
  });
  for (const section of sections.docs) {
    const lessons = await payload.find({
      collection: "lessons",
      where: { section: { equals: section.id } },
      limit: 1000,
      depth: 0,
      overrideAccess: true,
      draft: true,
    });
    for (const lesson of lessons.docs) {
      await payload.delete({
        collection: "lessons",
        id: lesson.id,
        overrideAccess: true,
      });
    }
    await payload.delete({
      collection: "sections",
      id: section.id,
      overrideAccess: true,
    });
  }

  await payload.delete({
    collection: "courses",
    id: courseId,
    overrideAccess: true,
  });

  if (slug && version) {
    try {
      await deleteBundle(slug, version);
    } catch {
      // Bundle-Cleanup ist best-effort — ein verwaister Ordner ist harmlos.
    }
  }
}

/**
 * Schaltet den KI-Tutor pro Kurs frei/aus. Liest den aktuellen `_status` und
 * reicht ihn beim Update durch, damit der Toggle den Publish-Zustand NICHT
 * versehentlich kippt (sonst würde ein Update auf einem published Kurs ihn je
 * nach Draft-Default zurück auf draft setzen).
 */
export async function setTutorEnabled(
  courseId: number,
  enabled: boolean,
): Promise<void> {
  const payload = await client();
  const course = await payload.findByID({
    collection: "courses",
    id: courseId,
    draft: true,
    overrideAccess: true,
  });
  const status: CourseStatus =
    course?._status === "published" ? "published" : "draft";

  await payload.update({
    collection: "courses",
    id: courseId,
    data: { tutorEnabled: enabled, _status: status },
    overrideAccess: true,
  });
}

// ============================================================
// Lernpfad-Lifecycle (learning-paths) — volles CRUD fürs MCP-Authoring.
// Pfade referenzieren Kurse NUR per Slug (kein Bundle, kein Content). Landen
// beim Upsert immer als Draft; Publish/Unpublish/Delete sind eigene Schritte.
// ============================================================

export type ManagedPath = {
  id: number;
  slug: string;
  title: string;
  status: CourseStatus;
  fuehrungsgrad: "linear" | "lose";
  courseCount: number;
};

export type ManagedPathDetail = {
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  fuehrungsgrad: "linear" | "lose";
  status: CourseStatus;
  courses: { courseSlug: string; role: "required" | "recommended" | "optional" }[];
};

export type PathUpsertResult = {
  slug: string;
  action: "created" | "updated";
  courseCount: number;
};

/** Alle Pfade inkl. Drafts — für die MCP-`list_paths`-Sicht. */
export async function listManagedPaths(): Promise<ManagedPath[]> {
  const payload = await client();
  const result = await payload.find({
    collection: "learning-paths",
    limit: 1000,
    sort: "title",
    depth: 0,
    draft: true,
    overrideAccess: true,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return result.docs.map((p: any) => ({
    id: p.id as number,
    slug: (p.slug as string) ?? "",
    title: (p.title as string) ?? "",
    status: p._status === "published" ? "published" : "draft",
    fuehrungsgrad: p.fuehrungsgrad === "lose" ? "lose" : "linear",
    courseCount: Array.isArray(p.courses) ? p.courses.length : 0,
  }));
}

/** Findet den rohen Pfad-Doc (inkl. Draft) per Slug — internes Helferlein. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findPathDoc(slug: string): Promise<any | null> {
  const payload = await client();
  const result = await payload.find({
    collection: "learning-paths",
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
    draft: true,
    overrideAccess: true,
  });
  return result.docs[0] ?? null;
}

/**
 * Vollständiger Pfad (inkl. Draft) zum Editieren — das Checkout-Gegenstück:
 * der Autor sieht alle Felder + die komplette Kursliste mit Rollen, ändert sie
 * und schreibt per `upsertLearningPath` zurück.
 */
export async function getManagedPath(
  slug: string,
): Promise<ManagedPathDetail | null> {
  const doc = await findPathDoc(slug);
  if (!doc) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const courses = (Array.isArray(doc.courses) ? doc.courses : []).map((c: any) => ({
    courseSlug: (c?.courseSlug as string) ?? "",
    role: (["required", "recommended", "optional"].includes(c?.role)
      ? c.role
      : "required") as "required" | "recommended" | "optional",
  }));
  return {
    slug: (doc.slug as string) ?? "",
    title: (doc.title as string) ?? "",
    subtitle: (doc.subtitle as string) ?? null,
    description: (doc.description as string) ?? null,
    fuehrungsgrad: doc.fuehrungsgrad === "lose" ? "lose" : "linear",
    status: doc._status === "published" ? "published" : "draft",
    courses,
  };
}

/**
 * Create/Edit eines Pfads — validiert gegen die bekannten Kurs-Slugs und
 * schreibt per find-by-slug → create/update. Landet IMMER als Draft (ein Edit
 * setzt einen live-Pfad bewusst zurück auf Draft → Review → erneut publishen).
 * Wirft bei ungültigem Input mit gesammelten Meldungen (Caller → errorResult).
 */
export async function upsertLearningPath(
  input: PathInputRaw,
): Promise<PathUpsertResult> {
  const known = (await listManagedCourses()).map((c) => c.slug);
  const res = validatePathInput(input, known);
  if (!res.ok) throw new Error(res.errors.join(" "));
  const v = res.value;

  const payload = await client();
  const existing = await findPathDoc(v.slug);
  const data = {
    title: v.title,
    slug: v.slug,
    subtitle: v.subtitle ?? null,
    description: v.description ?? null,
    fuehrungsgrad: v.fuehrungsgrad,
    courses: v.courses.map((c) => ({ courseSlug: c.courseSlug, role: c.role })),
    _status: "draft" as const,
  };

  if (existing) {
    await payload.update({
      collection: "learning-paths",
      id: existing.id,
      data,
      overrideAccess: true,
    });
    return { slug: v.slug, action: "updated", courseCount: v.courses.length };
  }

  await payload.create({
    collection: "learning-paths",
    data,
    overrideAccess: true,
  });
  return { slug: v.slug, action: "created", courseCount: v.courses.length };
}

/** Schaltet einen Pfad live. Keine Kaskade (Pfade haben keine Kinder). */
export async function publishLearningPath(slug: string): Promise<boolean> {
  const doc = await findPathDoc(slug);
  if (!doc) return false;
  const payload = await client();
  await payload.update({
    collection: "learning-paths",
    id: doc.id,
    data: { _status: "published" },
    overrideAccess: true,
  });
  return true;
}

/** Nimmt einen Pfad offline (zurück auf Draft) — reversibel, kein Datenverlust. */
export async function unpublishLearningPath(slug: string): Promise<boolean> {
  const doc = await findPathDoc(slug);
  if (!doc) return false;
  const payload = await client();
  await payload.update({
    collection: "learning-paths",
    id: doc.id,
    data: { _status: "draft" },
    overrideAccess: true,
  });
  return true;
}

/** Löscht einen Pfad hart. Berührt keine Kurse (nur Referenzen). */
export async function deleteLearningPath(slug: string): Promise<boolean> {
  const doc = await findPathDoc(slug);
  if (!doc) return false;
  const payload = await client();
  await payload.delete({
    collection: "learning-paths",
    id: doc.id,
    overrideAccess: true,
  });
  return true;
}

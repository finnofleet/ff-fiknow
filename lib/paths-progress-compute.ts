/**
 * Reine Pfad-Fortschritts-Aggregation — KEINE I/O, keine schweren Imports.
 *
 * Bewusst ein Leaf-Modul: nur `import type` (zur Laufzeit gelöscht), damit die
 * Logik ohne Payload/DB-Modulgraph läuft und isoliert verifizierbar ist. Das
 * Laden (getCourse + getCourseProgress) hängt lib/paths-progress.ts davor.
 *
 * Muster (Coursera „3/5 Kurse"): zählt abgeschlossene KURSE, nicht
 * Lektions-Mikroprozente. Kurs fertig = alle Lektionen completed
 * (0-Lektionen-Kurs gilt als vacuously done, blockiert „Weiterlernen" nicht).
 */
import type { PathRole } from "./paths";

export type PathCourseProgress = {
  courseSlug: string;
  title: string;
  role: PathRole;
  totalLessons: number;
  completedLessons: number;
  done: boolean;
  started: boolean;
};

export type PathProgress = {
  coursesTotal: number;
  coursesDone: number;
  pct: number;
  nextCourseSlug: string | null;
  perCourse: PathCourseProgress[];
};

export type PathCourseInput = {
  courseSlug: string;
  title: string;
  role: PathRole;
  totalLessons: number;
  completedLessons: number;
  startedLessons: number;
};

export function computePathProgress(inputs: PathCourseInput[]): PathProgress {
  const perCourse: PathCourseProgress[] = inputs.map((c) => {
    const done = c.totalLessons === 0 || c.completedLessons >= c.totalLessons;
    return {
      courseSlug: c.courseSlug,
      title: c.title,
      role: c.role,
      totalLessons: c.totalLessons,
      completedLessons: c.completedLessons,
      done,
      started: c.startedLessons > 0 || c.completedLessons > 0,
    };
  });

  const coursesTotal = perCourse.length;
  const coursesDone = perCourse.filter((c) => c.done).length;
  const pct =
    coursesTotal > 0 ? Math.round((coursesDone / coursesTotal) * 100) : 0;
  const nextCourseSlug = perCourse.find((c) => !c.done)?.courseSlug ?? null;

  return { coursesTotal, coursesDone, pct, nextCourseSlug, perCourse };
}

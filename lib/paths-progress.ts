/**
 * Pfad-Fortschritt — ABGELEITET aus lesson_progress, kein eigenes Primitiv.
 *
 * Lädt pro Member-Kurs Struktur + User-Fortschritt und reicht es an die reine
 * Aggregation (lib/paths-progress-compute.ts) weiter. Diese Datei hält nur das
 * I/O; die testbare Logik liegt im Leaf-Modul.
 */
import { getCourse } from "./content";
import type { LearningPath } from "./paths";
import {
  computePathProgress,
  type PathCourseInput,
  type PathProgress,
} from "./paths-progress-compute";
import { getCourseProgress, progressKey } from "./progress";

export {
  computePathProgress,
  type PathProgress,
  type PathCourseProgress,
  type PathCourseInput,
} from "./paths-progress-compute";

/**
 * Lädt pro auflösbarem Member-Kurs die Struktur + den User-Fortschritt und
 * aggregiert. Nicht auflösbare Kurse (course === null im Pfad) werden
 * übersprungen — sie zählen nicht zum Pfad-Fortschritt.
 */
export async function getPathProgress(
  userId: string,
  path: LearningPath,
): Promise<PathProgress> {
  const inputs: PathCourseInput[] = [];

  for (const member of path.courses) {
    if (!member.course) continue; // nicht published / fehlt → nicht zählen
    const course = await getCourse(member.courseSlug);
    if (!course) continue;

    const progress = await getCourseProgress(userId, member.courseSlug);
    let totalLessons = 0;
    let completedLessons = 0;
    let startedLessons = 0;
    for (const section of course.sections) {
      for (const lesson of section.lessons) {
        totalLessons += 1;
        const status = progress.get(progressKey(section.slug, lesson.slug));
        if (status === "completed") completedLessons += 1;
        else if (status === "in_progress") startedLessons += 1;
      }
    }

    inputs.push({
      courseSlug: member.courseSlug,
      title: course.frontmatter.title,
      role: member.role,
      totalLessons,
      completedLessons,
      startedLessons,
    });
  }

  return computePathProgress(inputs);
}

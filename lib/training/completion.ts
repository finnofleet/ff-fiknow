/**
 * Completion-Trigger für Pflichtkurse (ADR 0005 §4).
 *
 * Wird nach `markLessonCompleted` aus den Learn-Actions gerufen. Prüft, ob
 * der Kurs jetzt vollständig ist (dieselbe Definition wie
 * lib/paths-progress-compute.ts: alle Lektionen completed, 0-Lektionen-Kurs
 * gilt als vacuously done), und schließt — falls ja — alle OFFENEN
 * Assignments für `(userId, courseSlug)` ab.
 *
 * Append-only (ADR 0005 §3): `completedAt` wird nur bei Zeilen mit
 * `completedAt IS NULL` gesetzt. Bereits abgeschlossene Zeilen werden nie
 * angefasst — der WHERE-Filter auf `isNull(completedAt)` ist Teil des
 * Updates, kein reines Vor-Check.
 */
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { trainingAssignments } from "@/lib/db/schema";
import { getCourse } from "@/lib/content";
import { getCourseProgress, progressKey } from "@/lib/progress";

export async function syncCourseCompletion(
  userId: string,
  courseSlug: string,
): Promise<void> {
  const course = await getCourse(courseSlug);
  if (!course) return;

  const progress = await getCourseProgress(userId, courseSlug);
  let totalLessons = 0;
  let completedLessons = 0;
  for (const section of course.sections) {
    for (const lesson of section.lessons) {
      totalLessons += 1;
      const status = progress.get(progressKey(section.slug, lesson.slug));
      if (status === "completed") completedLessons += 1;
    }
  }

  const done = totalLessons === 0 || completedLessons >= totalLessons;
  if (!done) return;

  const now = new Date();
  await db
    .update(trainingAssignments)
    .set({
      completedAt: now,
      courseTitleSnapshot: course.frontmatter.title,
      courseVersionSnapshot: course.frontmatter.version ?? null,
      evidence: { type: "all_lessons" },
    })
    .where(
      and(
        eq(trainingAssignments.userId, userId),
        eq(trainingAssignments.courseSlug, courseSlug),
        isNull(trainingAssignments.completedAt),
      ),
    );
}

/**
 * Completion-Trigger für Pflichtkurse (ADR 0005 §4 + Abschnitt 6).
 *
 * Wird nach `markLessonCompleted` aus den Learn-Actions gerufen. Ermittelt die
 * Fakten (alle Lektionen erledigt? Quizze bestanden? Treiber/Umfang) und
 * delegiert die Entscheidung an die reine `decideCourseCompletion`
 * (completion-compute.ts). Schließt bei Abschluss alle OFFENEN Assignments für
 * `(userId, courseSlug)` ab und friert den Nachweis (`evidence`) ein.
 *
 * Append-only (ADR 0005 §3): `completedAt` wird nur bei Zeilen mit
 * `completedAt IS NULL` gesetzt. Bereits abgeschlossene Zeilen werden nie
 * angefasst — der WHERE-Filter auf `isNull(completedAt)` ist Teil des
 * Updates, kein reines Vor-Check. Die schärfere Lernkontroll-Regel greift
 * dadurch automatisch erst ab neuen/offenen Zuweisungen (keine rückwirkende
 * Entwertung bestehender Nachweise).
 */
import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { quizAttempts, trainingAssignments } from "@/lib/db/schema";
import { getCourse } from "@/lib/content";
import { getCourseProgress, progressKey } from "@/lib/progress";

import {
  decideCourseCompletion,
  type PassedQuiz,
  type QuizLessonRef,
} from "./completion-compute";

export async function syncCourseCompletion(
  userId: string,
  courseSlug: string,
): Promise<void> {
  const course = await getCourse(courseSlug);
  if (!course) return;

  const progress = await getCourseProgress(userId, courseSlug);
  let totalLessons = 0;
  let completedLessons = 0;
  const quizLessons: QuizLessonRef[] = [];
  for (const section of course.sections) {
    for (const lesson of section.lessons) {
      totalLessons += 1;
      const status = progress.get(progressKey(section.slug, lesson.slug));
      if (status === "completed") completedLessons += 1;
      if (lesson.frontmatter.type === "quiz") {
        quizLessons.push({
          sectionSlug: section.slug,
          lessonSlug: lesson.slug,
        });
      }
    }
  }

  const assessmentRequired = Boolean(course.frontmatter.assessment_required);

  // Bestandene Quiz-Versuche nur laden, wenn das Lernkontroll-Gate überhaupt
  // greifen kann — spart die Query im Normalfall (kein assessmentRequired).
  let passedQuizzes: PassedQuiz[] = [];
  if (assessmentRequired && quizLessons.length > 0) {
    const rows = await db
      .select({
        sectionSlug: quizAttempts.sectionSlug,
        lessonSlug: quizAttempts.lessonSlug,
        score: quizAttempts.score,
      })
      .from(quizAttempts)
      .where(
        and(
          eq(quizAttempts.userId, userId),
          eq(quizAttempts.courseSlug, courseSlug),
          eq(quizAttempts.passed, true),
          inArray(
            quizAttempts.lessonSlug,
            quizLessons.map((q) => q.lessonSlug),
          ),
        ),
      );
    passedQuizzes = rows.map((r) => ({
      sectionSlug: r.sectionSlug,
      lessonSlug: r.lessonSlug,
      score: r.score,
    }));
  }

  const decision = decideCourseCompletion({
    totalLessons,
    completedLessons,
    assessmentRequired,
    quizLessons,
    passedQuizzes,
    drivers: course.frontmatter.compliance_drivers ?? [],
    estimatedMinutes: course.frontmatter.estimated_minutes ?? null,
  });

  if (!decision.complete) return;

  const now = new Date();
  await db
    .update(trainingAssignments)
    .set({
      completedAt: now,
      courseTitleSnapshot: course.frontmatter.title,
      courseVersionSnapshot: course.frontmatter.version ?? null,
      evidence: decision.evidence,
    })
    .where(
      and(
        eq(trainingAssignments.userId, userId),
        eq(trainingAssignments.courseSlug, courseSlug),
        isNull(trainingAssignments.completedAt),
      ),
    );
}

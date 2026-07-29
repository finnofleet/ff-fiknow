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
 *
 * `confirmationRequired` (Phase 6c): `opts.confirmed` wird von den Learn-
 * Actions durchgereicht (Checkbox „Ich bestätige …" auf der letzten Lektion)
 * und ist nur relevant, wenn `course.frontmatter.confirmation_required`
 * gesetzt ist. Bei Abschluss ergänzt diese I/O-Schicht `confirmedAt` im
 * eingefrorenen `evidence.confirmation` — die reine `decideCourseCompletion`
 * kennt nur `confirmed: true`, keine Zeitstempel.
 *
 * Abschlusstest-Gate (Phase 7a, 1b-ii): existiert im Kurs eine Lesson mit
 * `frontmatter.final_exam === true`, wird deren server-gewerteter
 * Bestehens-Status (`quiz_attempts.passed`) IMMER geladen — unabhängig von
 * `assessmentRequired`. Der Ladevorgang ist bewusst von der `assessmentRequired`-
 * Bedingung entkoppelt, da ein Abschlusstest das formative Lernkontroll-Gate
 * ersetzt statt es zu ergänzen (siehe `decideCourseCompletion`).
 */
import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { profiles, quizAttempts, trainingAssignments } from "@/lib/db/schema";
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
  opts?: { confirmed?: boolean },
): Promise<void> {
  const course = await getCourse(courseSlug);
  if (!course) return;

  const progress = await getCourseProgress(userId, courseSlug);
  let totalLessons = 0;
  let completedLessons = 0;
  const quizLessons: QuizLessonRef[] = [];
  // Abschlusstest-Lesson des Kurses (falls vorhanden) — erste gefundene
  // final_exam-Lesson gewinnt, robust falls mehrere markiert waeren.
  let finalExam: { sectionSlug: string; lessonSlug: string; passingScore: number } | null =
    null;
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
      if (!finalExam && lesson.frontmatter.final_exam) {
        finalExam = {
          sectionSlug: section.slug,
          lessonSlug: lesson.slug,
          passingScore: lesson.frontmatter.passing_score ?? 0.7,
        };
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

  // Abschlusstest-Bestehens-Status IMMER laden, wenn ein final_exam
  // existiert — unabhaengig von assessmentRequired (das Abschlusstest-Gate
  // ersetzt das formative Gate, siehe decideCourseCompletion).
  let finalExamPassed = false;
  // Versuche bis zum ersten Bestehen (Phase 7b) — Zaehler, kein Score. Alle
  // Versuche der final_exam-Lesson chronologisch laden und die Position des
  // ersten bestandenen Versuchs bestimmen (1-basiert). Kein Bestehen -> 0.
  let finalExamAttempts = 0;
  if (finalExam) {
    const attemptRows = await db
      .select({ attemptedAt: quizAttempts.attemptedAt, passed: quizAttempts.passed })
      .from(quizAttempts)
      .where(
        and(
          eq(quizAttempts.userId, userId),
          eq(quizAttempts.courseSlug, courseSlug),
          eq(quizAttempts.sectionSlug, finalExam.sectionSlug),
          eq(quizAttempts.lessonSlug, finalExam.lessonSlug),
        ),
      )
      .orderBy(asc(quizAttempts.attemptedAt));
    const firstPassIdx = attemptRows.findIndex((r) => r.passed);
    finalExamPassed = firstPassIdx >= 0;
    finalExamAttempts = firstPassIdx >= 0 ? firstPassIdx + 1 : 0;
  }

  const confirmationRequired = Boolean(course.frontmatter.confirmation_required);

  const decision = decideCourseCompletion({
    totalLessons,
    completedLessons,
    assessmentRequired,
    quizLessons,
    passedQuizzes,
    drivers: course.frontmatter.compliance_drivers ?? [],
    estimatedMinutes: course.frontmatter.estimated_minutes ?? null,
    confirmationRequired,
    finalExam,
    finalExamPassed,
    finalExamAttempts,
    confirmed: opts?.confirmed ?? false,
  });

  if (!decision.complete) return;

  const now = new Date();
  const evidence = decision.evidence;
  if (evidence.confirmation) {
    evidence.confirmation = {
      ...evidence.confirmation,
      confirmedAt: now.toISOString(),
    };
  }

  // Land/BU der Person zum Abschlusszeitpunkt einfrieren (ADR 0007 §3,
  // Phase P2a) — analog courseVersionSnapshot. Kein Profil vorhanden?
  // Dann bleiben beide Snapshots null; die Completion darf trotzdem
  // durchlaufen (kein Throw).
  const [profile] = await db
    .select({ land: profiles.land, bu: profiles.bu })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);

  await db
    .update(trainingAssignments)
    .set({
      completedAt: now,
      courseTitleSnapshot: course.frontmatter.title,
      courseVersionSnapshot: course.frontmatter.version ?? null,
      landSnapshot: profile?.land ?? null,
      buSnapshot: profile?.bu ?? null,
      evidence,
    })
    .where(
      and(
        eq(trainingAssignments.userId, userId),
        eq(trainingAssignments.courseSlug, courseSlug),
        isNull(trainingAssignments.completedAt),
      ),
    );
}

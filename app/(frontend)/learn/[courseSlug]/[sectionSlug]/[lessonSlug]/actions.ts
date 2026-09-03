"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { and, eq } from "drizzle-orm";

import { getCurrentUser } from "@/lib/auth/session";
import { getCourse, getLesson } from "@/lib/content";
import { db } from "@/lib/db/client";
import { lessonProgress, quizAttempts } from "@/lib/db/schema";
import { redactError } from "@/lib/log-redact";
import { markLessonCompleted, resetExamSeed } from "@/lib/progress";
import { extractExamQuestions, gradeExam } from "@/lib/quiz/exam-grade";
import { getPoolQuestions } from "@/lib/quiz/pool-loader";
import { gradePoolAttempt, selectPoolQuestions } from "@/lib/quiz/pool";
import { syncCourseCompletion } from "@/lib/training/completion";

export type QuizAnswer = {
  prompt: string;
  selected: number[];
  correct: number[];
  isCorrect: boolean;
};

export type SubmitQuizPayload = {
  courseSlug: string;
  sectionSlug: string;
  lessonSlug: string;
  answers: QuizAnswer[];
  score: number;
  passed: boolean;
  next: string;
  /** Verständnisbestätigung (Phase 6c) — nur relevant auf der letzten Lektion. */
  confirmed?: boolean;
  /**
   * Seed der Pool-Ziehung (ADR 0009, D2-ii-a) — vom Client mitgeschickt, NUR
   * bei Fragen-Pool-Praefungen gesetzt (siehe QuizShell `seed`-Prop). Der
   * Server reproduziert damit `selectPoolQuestions` und bewertet NUR gegen
   * diese Ziehung — fehlt er (normale Quizze/inline-Abschlusstests), bleibt
   * dieser Zweig ungenutzt.
   */
  seed?: string;
};

export async function submitQuizAttemptAction(payload: SubmitQuizPayload) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Abschlusstest? Dann ist die Bewertung verbindlich (Compliance-Nachweis) —
  // Client-gemeldete score/passed werden NICHT vertraut (der Client koennte
  // beliebige Werte schicken). Zwei Varianten (ADR 0009, D2-ii-a, Koexistenz
  // mit Phase 7a):
  //   - Fragen-Pool (`question_pool` gesetzt): die gezogenen Fragen kommen
  //     aus dem `questions`-Index (D1), server-seitig via `selectPoolQuestions`
  //     + `getPoolQuestions` reproduziert und mit `gradePoolAttempt` bewertet.
  //   - Sonst, inline-Abschlusstest (`final_exam`): wie bisher aus dem
  //     Lesson-Body (MDX <Question>/<Option>) neu bewertet.
  // Bei normalen (Uebungs-)Quizzes bleibt das bisherige Client-Grading
  // massgeblich.
  const lesson = await getLesson(
    payload.courseSlug,
    payload.sectionSlug,
    payload.lessonSlug,
  );
  const pool = lesson?.frontmatter.question_pool;
  const isPoolExam = Boolean(pool && pool.length > 0);
  const isFinalExam = Boolean(lesson?.frontmatter.final_exam);
  const passingScore = lesson?.frontmatter.passing_score ?? 0.7;

  let score = payload.score;
  let passed = payload.passed;
  if (isPoolExam && pool) {
    const course = await getCourse(payload.courseSlug);
    const version = course?.frontmatter.version ?? "";
    const n = lesson?.frontmatter.questions_per_attempt ?? pool.length;
    // Integritaet: die Ziehung wird gegen den SERVER-gespeicherten,
    // eingefrorenen Seed reproduziert (lesson_progress.exam_seed) — NICHT
    // gegen `payload.seed`, den der Client beliebig setzen koennte. Fallback
    // auf `payload.seed` nur defensiv (z. B. Draft-Vorschau ohne Progress-
    // Zeile, wo bewusst kein Seed persistiert wird).
    const [progressRow] = await db
      .select({ examSeed: lessonProgress.examSeed })
      .from(lessonProgress)
      .where(
        and(
          eq(lessonProgress.userId, user.id),
          eq(lessonProgress.courseSlug, payload.courseSlug),
          eq(lessonProgress.sectionSlug, payload.sectionSlug),
          eq(lessonProgress.lessonSlug, payload.lessonSlug),
        ),
      );
    const gradingSeed = progressRow?.examSeed ?? payload.seed ?? "";
    const drawn = selectPoolQuestions(pool, n, gradingSeed);
    const selected = await getPoolQuestions(payload.courseSlug, version, drawn);
    const graded = gradePoolAttempt(
      selected,
      payload.answers.map((a) => ({ prompt: a.prompt, selected: a.selected })),
      passingScore,
    );
    score = graded.score;
    passed = graded.passed;
  } else if (isFinalExam && lesson?.body) {
    // Inline-Abschlusstest (7a) — greift NUR, wenn KEIN question_pool gesetzt
    // ist (Koexistenz, siehe Kommentar oben).
    const graded = gradeExam(
      extractExamQuestions(lesson.body),
      payload.answers.map((a) => ({ prompt: a.prompt, selected: a.selected })),
      passingScore,
    );
    score = graded.score;
    passed = graded.passed;
  }

  await db.insert(quizAttempts).values({
    userId: user.id,
    courseSlug: payload.courseSlug,
    sectionSlug: payload.sectionSlug,
    lessonSlug: payload.lessonSlug,
    answers: payload.answers,
    score,
    passed,
    attemptedAt: new Date(),
  });

  // Gate (Bug-Fix, 7a): ein durchgefallener Abschlusstest markiert die
  // Lektion NICHT als erledigt. Pool-Praefungen sind per Definition
  // Abschlusstests (siehe ADR 0009-Vorgabe oben) und unterliegen demselben
  // Gate. Bei normalen Quizzes (weder Pool noch final_exam) bleibt das
  // bisherige Verhalten (immer completed nach Absenden).
  if (!(isPoolExam || isFinalExam) || passed) {
    await markLessonCompleted({
      userId: user.id,
      courseSlug: payload.courseSlug,
      sectionSlug: payload.sectionSlug,
      lessonSlug: payload.lessonSlug,
    });
  }

  try {
    await syncCourseCompletion(user.id, payload.courseSlug, {
      confirmed: payload.confirmed,
    });
  } catch (err) {
    console.error("[training] syncCourseCompletion fehlgeschlagen:", redactError(err));
  }

  revalidatePath(`/learn/${payload.courseSlug}`, "layout");
  revalidatePath("/dashboard");
  revalidatePath(`/courses/${payload.courseSlug}`);

  if (payload.next) redirect(payload.next);
  redirect(`/courses/${payload.courseSlug}`);
}

export async function completeAndContinueAction(formData: FormData) {
  const courseSlug = String(formData.get("course_slug") ?? "");
  const sectionSlug = String(formData.get("section_slug") ?? "");
  const lessonSlug = String(formData.get("lesson_slug") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirmed = formData.get("confirmed") === "on" || formData.get("confirmed") === "true";

  if (!courseSlug || !sectionSlug || !lessonSlug) return;

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  await markLessonCompleted({
    userId: user.id,
    courseSlug,
    sectionSlug,
    lessonSlug,
  });

  try {
    await syncCourseCompletion(user.id, courseSlug, { confirmed });
  } catch (err) {
    console.error("[training] syncCourseCompletion fehlgeschlagen:", redactError(err));
  }

  revalidatePath(`/learn/${courseSlug}`, "layout");
  revalidatePath("/dashboard");
  revalidatePath(`/courses/${courseSlug}`);

  if (next) redirect(next);
  redirect(`/courses/${courseSlug}`);
}

export type ResetExamPayload = {
  courseSlug: string;
  sectionSlug: string;
  lessonSlug: string;
};

/**
 * "Neuer Versuch" (explizite User-Aktion, Gegenstueck zum Bug-Fix oben): setzt
 * den eingefrorenen Pool-Seed zurueck, damit der naechste Render der
 * Lesson-Seite eine frische Ziehung erzeugt (`ensureExamSeed`). Die Seite
 * selbst zieht bewusst NIE automatisch neu — nur dieser Pfad.
 */
export async function resetExamAction(payload: ResetExamPayload) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  await resetExamSeed({
    userId: user.id,
    courseSlug: payload.courseSlug,
    sectionSlug: payload.sectionSlug,
    lessonSlug: payload.lessonSlug,
  });

  revalidatePath(
    `/learn/${payload.courseSlug}/${payload.sectionSlug}/${payload.lessonSlug}`,
  );
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { quizAttempts } from "@/lib/db/schema";
import { markLessonCompleted } from "@/lib/progress";
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
};

export async function submitQuizAttemptAction(payload: SubmitQuizPayload) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  await db.insert(quizAttempts).values({
    userId: user.id,
    courseSlug: payload.courseSlug,
    sectionSlug: payload.sectionSlug,
    lessonSlug: payload.lessonSlug,
    answers: payload.answers,
    score: payload.score,
    passed: payload.passed,
    attemptedAt: new Date(),
  });

  await markLessonCompleted({
    userId: user.id,
    courseSlug: payload.courseSlug,
    sectionSlug: payload.sectionSlug,
    lessonSlug: payload.lessonSlug,
  });

  try {
    await syncCourseCompletion(user.id, payload.courseSlug, {
      confirmed: payload.confirmed,
    });
  } catch (err) {
    console.error("[training] syncCourseCompletion fehlgeschlagen:", err);
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
    console.error("[training] syncCourseCompletion fehlgeschlagen:", err);
  }

  revalidatePath(`/learn/${courseSlug}`, "layout");
  revalidatePath("/dashboard");
  revalidatePath(`/courses/${courseSlug}`);

  if (next) redirect(next);
  redirect(`/courses/${courseSlug}`);
}

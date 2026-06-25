import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { lessonProgress } from "@/lib/db/schema";

export type LessonStatus = "not_started" | "in_progress" | "completed";

export type ProgressKey = {
  userId: string;
  courseSlug: string;
  sectionSlug: string;
  lessonSlug: string;
};

/**
 * Markiert die Lesson als gestartet. Falls sie schon "completed" ist, bleibt
 * der Status erhalten (nur updated_at wird aktualisiert).
 */
export async function markLessonInProgress(key: ProgressKey) {
  const now = new Date();
  await db
    .insert(lessonProgress)
    .values({
      userId: key.userId,
      courseSlug: key.courseSlug,
      sectionSlug: key.sectionSlug,
      lessonSlug: key.lessonSlug,
      status: "in_progress",
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        lessonProgress.userId,
        lessonProgress.courseSlug,
        lessonProgress.sectionSlug,
        lessonProgress.lessonSlug,
      ],
      set: {
        // updated_at immer mitziehen, status nicht herabstufen
        updatedAt: now,
        status: sql`CASE WHEN ${lessonProgress.status} = 'completed' THEN 'completed' ELSE 'in_progress' END`,
      },
    });
}

/**
 * Markiert die Lesson als abgeschlossen und setzt completed_at.
 */
export async function markLessonCompleted(key: ProgressKey) {
  const now = new Date();
  await db
    .insert(lessonProgress)
    .values({
      userId: key.userId,
      courseSlug: key.courseSlug,
      sectionSlug: key.sectionSlug,
      lessonSlug: key.lessonSlug,
      status: "completed",
      completedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        lessonProgress.userId,
        lessonProgress.courseSlug,
        lessonProgress.sectionSlug,
        lessonProgress.lessonSlug,
      ],
      set: {
        status: "completed",
        completedAt: now,
        updatedAt: now,
      },
    });
}

export type ProgressMap = Map<string, LessonStatus>;

/** Liefert eine Map "<sectionSlug>/<lessonSlug>" → Status für einen Course. */
export async function getCourseProgress(
  userId: string,
  courseSlug: string,
): Promise<ProgressMap> {
  const rows = await db
    .select()
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        eq(lessonProgress.courseSlug, courseSlug),
      ),
    );
  const map: ProgressMap = new Map();
  for (const row of rows) {
    map.set(`${row.sectionSlug}/${row.lessonSlug}`, row.status as LessonStatus);
  }
  return map;
}

export function progressKey(sectionSlug: string, lessonSlug: string) {
  return `${sectionSlug}/${lessonSlug}`;
}

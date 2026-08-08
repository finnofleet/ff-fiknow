import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { enrollments, lessonProgress } from "@/lib/db/schema";

export type LessonStatus = "not_started" | "in_progress" | "completed";

/**
 * Ereignis „Einschreibung" (`enrolled_at`): stellt sicher, dass fuer
 * (user, course) eine Enrollment-Zeile existiert. Setzt bewusst KEIN
 * `started_at` — Einschreiben und Lernbeginn sind zwei getrennte Ereignisse
 * (siehe schema.ts). Idempotent via onConflictDoNothing auf dem Composite-PK;
 * `enrolled_at` (DB-Default now()) bleibt beim ersten Insert stehen.
 */
export async function ensureEnrollment(
  userId: string,
  courseSlug: string,
): Promise<void> {
  await db
    .insert(enrollments)
    .values({ userId, courseSlug })
    .onConflictDoNothing();
}

/**
 * Ereignis „Lernbeginn" (`started_at`): wird beim ersten Oeffnen einer Lektion
 * gerufen (Learn-Page, Draft-Vorschau ausgenommen). Setzt `started_at` genau
 * einmal — der erste Start gilt (COALESCE, wird nie ueberschrieben). Existiert
 * noch keine Zeile (Start ohne vorheriges Einschreiben), wird sie angelegt;
 * `enrolled_at` faellt dann per Default auf denselben Zeitpunkt. Das
 * Compliance-„Startdatum" liest genau dieses Feld.
 */
export async function markCourseStarted(
  userId: string,
  courseSlug: string,
): Promise<void> {
  const now = new Date();
  await db
    .insert(enrollments)
    .values({ userId, courseSlug, startedAt: now })
    .onConflictDoUpdate({
      target: [enrollments.userId, enrollments.courseSlug],
      set: {
        startedAt: sql`COALESCE(${enrollments.startedAt}, excluded.started_at)`,
      },
    });
}

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

/**
 * Friert die Fragen-Pool-Ziehung fuer einen Abschlusstest ein (Bug-Fix: die
 * Seite zog bisher bei JEDEM Render einen neuen `randomUUID()`-Seed, sodass
 * ein Reload die gezogenen Fragen reshuffelte und Antworten verfaelscht
 * zugeordnet wurden). Liefert den bereits gespeicherten Seed, falls einer
 * existiert — sonst wird einmalig ein neuer erzeugt, persistiert und
 * zurueckgegeben.
 *
 * Upsert auf dem PK (funktioniert auch, wenn die Progress-Zeile noch nicht
 * existiert). Bei Konflikt wird `exam_seed` NUR gesetzt, wenn er aktuell
 * `null` ist (`COALESCE`) — ein bereits vorhandener Seed wird nie
 * ueberschrieben, damit gleichzeitige Loads (z. B. zwei Tabs) auf denselben
 * Seed konvergieren statt sich gegenseitig zu ueberschreiben.
 */
export async function ensureExamSeed(key: ProgressKey): Promise<string> {
  const candidateSeed = randomUUID();
  const now = new Date();
  const rows = await db
    .insert(lessonProgress)
    .values({
      userId: key.userId,
      courseSlug: key.courseSlug,
      sectionSlug: key.sectionSlug,
      lessonSlug: key.lessonSlug,
      examSeed: candidateSeed,
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
        // Nur uebernehmen, wenn noch kein Seed gespeichert ist — ein
        // bestehender Seed bleibt eingefroren.
        examSeed: sql`COALESCE(${lessonProgress.examSeed}, excluded.exam_seed)`,
      },
    })
    .returning({ examSeed: lessonProgress.examSeed });

  return rows[0]?.examSeed ?? candidateSeed;
}

/**
 * Setzt den eingefrorenen Pool-Seed zurueck ("Neuer Versuch", explizite
 * User-Aktion) — die naechste Ziehung erzeugt einen frischen Seed via
 * `ensureExamSeed`. No-op, falls die Progress-Zeile (noch) nicht existiert.
 */
export async function resetExamSeed(key: ProgressKey): Promise<void> {
  await db
    .update(lessonProgress)
    .set({ examSeed: null, updatedAt: new Date() })
    .where(
      and(
        eq(lessonProgress.userId, key.userId),
        eq(lessonProgress.courseSlug, key.courseSlug),
        eq(lessonProgress.sectionSlug, key.sectionSlug),
        eq(lessonProgress.lessonSlug, key.lessonSlug),
      ),
    );
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

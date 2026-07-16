/**
 * I/O-Loader für das Compliance-Dashboard (ADR 0005 §5, Phase 4).
 *
 * Sammelt alle Rohdaten (Assignments, Profile, Enrollments, Lesson-Progress,
 * Kurs-Titel) und übergibt sie an die reine Aggregation
 * (lib/training/compliance-compute.ts). Autorisierung ist App-seitig
 * (Rollen-Check in der aufrufenden Page via `canManageCourses`), NICHT über
 * RLS — diese Funktion läuft über die privilegierte Server-`db`-Connection
 * (RLS-Bypass, wie `training_assignments`-Select in reconcile.ts) und liest
 * daher bewusst ALLE User, nicht nur die des Aufrufers.
 */
import { getCourse } from "@/lib/content";
import { db } from "@/lib/db/client";
import { enrollments, lessonProgress, profiles, trainingAssignments } from "@/lib/db/schema";

import { computeCompliance, type CourseCompliance } from "./compliance-compute";
import { reconcileAssignments } from "./reconcile";

function participantKey(userId: string, courseSlug: string): string {
  return `${userId}::${courseSlug}`;
}

/**
 * Liest den vollen Compliance-Stand über alle Pflichtkurse. Stößt vorab
 * `reconcileAssignments()` an (frische Zuweisungen inkl. lazy
 * Rezertifizierung), bevor gelesen wird — analog `getMyTrainingAssignments`
 * darf ein Fehlschlag dabei das Dashboard NIE zum Absturz bringen (nur
 * geloggt, dann mit dem vorhandenen Stand weiter).
 */
export async function getComplianceOverview(): Promise<CourseCompliance[]> {
  try {
    await reconcileAssignments();
  } catch (err) {
    console.error(
      "[training/compliance] reconcileAssignments() fehlgeschlagen",
      err,
    );
  }

  const assignmentRows = await db
    .select({
      userId: trainingAssignments.userId,
      courseSlug: trainingAssignments.courseSlug,
      completedAt: trainingAssignments.completedAt,
    })
    .from(trainingAssignments);

  if (assignmentRows.length === 0) return [];

  const profileRows = await db
    .select({ userId: profiles.userId, displayName: profiles.displayName })
    .from(profiles);
  const displayNames = new Map<string, string>();
  for (const row of profileRows) {
    if (row.displayName) displayNames.set(row.userId, row.displayName);
  }

  const enrollmentRows = await db
    .select({ userId: enrollments.userId, courseSlug: enrollments.courseSlug, startedAt: enrollments.startedAt })
    .from(enrollments);
  const startedAt = new Map<string, Date>();
  for (const row of enrollmentRows) {
    startedAt.set(participantKey(row.userId, row.courseSlug), row.startedAt);
  }

  const progressRows = await db
    .selectDistinct({
      userId: lessonProgress.userId,
      courseSlug: lessonProgress.courseSlug,
    })
    .from(lessonProgress);
  const hasProgress = new Set<string>(
    progressRows.map((row) => participantKey(row.userId, row.courseSlug)),
  );

  // Titel batchen: je distinct Slug nur einmal laden, nicht pro Zeile.
  const courseSlugs = Array.from(
    new Set(assignmentRows.map((row) => row.courseSlug)),
  );
  const titles = new Map<string, string>();
  await Promise.all(
    courseSlugs.map(async (slug) => {
      try {
        const course = await getCourse(slug);
        if (course) titles.set(slug, course.frontmatter.title);
      } catch (err) {
        console.error(`[training/compliance] getCourse(${slug}) fehlgeschlagen`, err);
      }
    }),
  );

  return computeCompliance({
    assignments: assignmentRows,
    startedAt,
    hasProgress,
    displayNames,
    titles,
  });
}

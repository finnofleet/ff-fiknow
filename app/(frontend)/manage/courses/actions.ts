"use server";

import { revalidatePath } from "next/cache";

import { canManageCourses } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import {
  deleteCourseCascade,
  publishCourseCascade,
  setTutorEnabled,
  unpublishCourse,
} from "@/lib/authoring/lifecycle";

/**
 * Server-Actions für die Kurs-Verwaltung (/manage/courses).
 *
 * Auth-/Role-Check passiert PRO ACTION, nicht nur im Layout — Server-Actions
 * sind direkt aufrufbar und durchlaufen die Page-Auth nicht (analog zu
 * manage/users/actions.ts).
 *
 * Die eigentliche Lifecycle-Logik (Payload Local API, _status-Kaskade,
 * Delete-Kaskade) lebt in lib/authoring/lifecycle.ts — dieselbe Quelle, die
 * auch der CLI-/Plugin-Publish-Endpoint nutzt.
 */

async function requireCurator() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Nicht eingeloggt.");
  if (!canManageCourses(user.role)) {
    throw new Error("Nur Kurator:innen oder Admins können Kurse verwalten.");
  }
  return user;
}

export type ActionResult = { ok: true } | { ok: false; error: string };

function toCourseId(raw: number): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`Ungültige Kurs-ID: ${raw}`);
  }
  return id;
}

/** Kurs (+ Sections/Lessons) live schalten. */
export async function publishCourseAction(
  courseId: number,
): Promise<ActionResult> {
  try {
    await requireCurator();
    await publishCourseCascade(toCourseId(courseId), true);
    revalidatePath("/manage/courses");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Kurs vom Netz nehmen (zurück auf Draft → im Katalog unsichtbar). */
export async function unpublishCourseAction(
  courseId: number,
): Promise<ActionResult> {
  try {
    await requireCurator();
    await unpublishCourse(toCourseId(courseId));
    revalidatePath("/manage/courses");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Kurs samt Sections + Lessons unwiderruflich löschen. */
export async function deleteCourseAction(
  courseId: number,
): Promise<ActionResult> {
  try {
    await requireCurator();
    await deleteCourseCascade(toCourseId(courseId));
    revalidatePath("/manage/courses");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** KI-Tutor pro Kurs frei-/abschalten (Publish-Status bleibt erhalten). */
export async function toggleTutorAction(
  courseId: number,
  enabled: boolean,
): Promise<ActionResult> {
  try {
    await requireCurator();
    await setTutorEnabled(toCourseId(courseId), Boolean(enabled));
    revalidatePath("/manage/courses");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

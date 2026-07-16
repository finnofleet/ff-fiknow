"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { enrollments } from "@/lib/db/schema";

export async function enrollAction(formData: FormData) {
  const courseSlug = String(formData.get("course_slug") ?? "");
  if (!courseSlug) return;

  const user = await getCurrentUser();

  if (!user) {
    redirect(`/login?redirect=/courses/${courseSlug}`);
  }

  await db
    .insert(enrollments)
    .values({ userId: user.id, courseSlug })
    .onConflictDoNothing();

  revalidatePath(`/courses/${courseSlug}`);
  revalidatePath("/dashboard");
}

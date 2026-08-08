"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { ensureEnrollment } from "@/lib/progress";

export async function enrollAction(formData: FormData) {
  const courseSlug = String(formData.get("course_slug") ?? "");
  if (!courseSlug) return;

  const user = await getCurrentUser();

  if (!user) {
    redirect(`/login?redirect=/courses/${courseSlug}`);
  }

  await ensureEnrollment(user.id, courseSlug);

  revalidatePath(`/courses/${courseSlug}`);
  revalidatePath("/dashboard");
}

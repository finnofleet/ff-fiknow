/**
 * Daten-Zugriff für die Annotations-Schicht (ADR 0002).
 *
 * Alle Reads/Writes sind explizit auf `userId` gescopet — die serverseitige
 * `db`-Connection ist Postgres-Owner und umgeht RLS, also setzt der App-Code
 * das Scoping (Defense-in-Depth, RLS-Policies sind das Sicherheitsnetz). Gleich
 * wie lib/progress.ts.
 */
import { and, asc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { annotations } from "@/lib/db/schema";

/** Längen-Caps (untrusted Input → Memory-/Kosten-Hygiene). */
export const MAX_BODY_CHARS = 20_000;
export const MAX_ANCHOR_CHARS = 1_000;

export const ANNOTATION_TYPES = [
  "highlight",
  "note",
  "tutor_explanation",
  "flashcard",
] as const;
export type AnnotationType = (typeof ANNOTATION_TYPES)[number];

export function isAnnotationType(v: unknown): v is AnnotationType {
  return (
    typeof v === "string" && (ANNOTATION_TYPES as readonly string[]).includes(v)
  );
}

export interface LessonRef {
  courseSlug: string;
  sectionSlug: string;
  lessonSlug: string;
}

export interface NewAnnotation extends LessonRef {
  userId: string;
  bundleVersion?: string | null;
  type: AnnotationType;
  anchorQuote?: string | null;
  anchorPrefix?: string | null;
  anchorSuffix?: string | null;
  anchorStart?: number | null;
  anchorEnd?: number | null;
  color?: string | null;
  body?: string | null;
}

/** DTO für den Client (camelCase, ISO-Strings). */
export interface AnnotationDTO {
  id: string;
  courseSlug: string;
  sectionSlug: string;
  lessonSlug: string;
  bundleVersion: string | null;
  type: AnnotationType;
  anchorQuote: string | null;
  anchorPrefix: string | null;
  anchorSuffix: string | null;
  anchorStart: number | null;
  anchorEnd: number | null;
  color: string | null;
  body: string | null;
  createdAt: string;
  updatedAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toDTO(row: any): AnnotationDTO {
  return {
    id: row.id,
    courseSlug: row.courseSlug,
    sectionSlug: row.sectionSlug,
    lessonSlug: row.lessonSlug,
    bundleVersion: row.bundleVersion ?? null,
    type: row.type,
    anchorQuote: row.anchorQuote ?? null,
    anchorPrefix: row.anchorPrefix ?? null,
    anchorSuffix: row.anchorSuffix ?? null,
    anchorStart: row.anchorStart ?? null,
    anchorEnd: row.anchorEnd ?? null,
    color: row.color ?? null,
    body: row.body ?? null,
    createdAt:
      row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt:
      row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
  };
}

/** Alle Annotationen eines Users für genau eine Lesson, älteste zuerst. */
export async function listAnnotationsForLesson(
  userId: string,
  ref: LessonRef,
): Promise<AnnotationDTO[]> {
  const rows = await db
    .select()
    .from(annotations)
    .where(
      and(
        eq(annotations.userId, userId),
        eq(annotations.courseSlug, ref.courseSlug),
        eq(annotations.sectionSlug, ref.sectionSlug),
        eq(annotations.lessonSlug, ref.lessonSlug),
      ),
    )
    .orderBy(asc(annotations.createdAt));
  return rows.map(toDTO);
}

export async function createAnnotation(
  input: NewAnnotation,
): Promise<AnnotationDTO> {
  const [row] = await db
    .insert(annotations)
    .values({
      userId: input.userId,
      courseSlug: input.courseSlug,
      sectionSlug: input.sectionSlug,
      lessonSlug: input.lessonSlug,
      bundleVersion: input.bundleVersion ?? null,
      type: input.type,
      anchorQuote: input.anchorQuote ?? null,
      anchorPrefix: input.anchorPrefix ?? null,
      anchorSuffix: input.anchorSuffix ?? null,
      anchorStart: input.anchorStart ?? null,
      anchorEnd: input.anchorEnd ?? null,
      color: input.color ?? null,
      body: input.body ?? null,
    })
    .returning();
  return toDTO(row);
}

/** Löscht eine Annotation des Users. true = es wurde eine Zeile gelöscht. */
export async function deleteAnnotation(
  userId: string,
  id: string,
): Promise<boolean> {
  const deleted = await db
    .delete(annotations)
    .where(and(eq(annotations.id, id), eq(annotations.userId, userId)))
    .returning({ id: annotations.id });
  return deleted.length > 0;
}

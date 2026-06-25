/**
 * RAG-Index-Generierung (ADR 0003, Entscheidung 4) — chunked + embeddet die
 * Lektionen eines Kurses und legt die Vektoren versions-gekeyt in
 * `lesson_chunks` ab. Pflegt `course_index_state` als „needs-reindex"-Marker.
 *
 * Best-effort: ein Embedding-Hänger (oder fehlender Key) lässt den Aufruf NICHT
 * scheitern — er markiert den Kurs als `needs_reindex` und gibt das im Result
 * zurück. So darf der Upload-Hook das hier feuern, ohne den Upload zu riskieren.
 * Echte DB-Fehler werfen (das ist kein erwarteter Zustand).
 *
 * Wiederverwendet von:
 *   - dem Import-Hook (lib/authoring/import.ts) — mit dem frischen Bundle,
 *   - dem Re-Index-Trigger / Backfill — mit aus dem Storage geladenen Bundles.
 */
import { sql } from "drizzle-orm";

import { db, schema } from "@/lib/db/client";
import {
  EmbeddingError,
  getEmbeddingProvider,
  isEmbeddingConfigured,
} from "@/lib/embeddings";

import { chunkLessonBody } from "./chunking";

export interface IndexableLesson {
  sectionSlug: string;
  lessonSlug: string;
  body: string;
}

export interface IndexCourseInput {
  courseSlug: string;
  /** = courses.version, versions-gekeyt wie der Bundle-Storage. */
  version: string;
  lessons: IndexableLesson[];
}

export type IndexStatus = "indexed" | "needs_reindex";

export interface IndexResult {
  status: IndexStatus;
  chunkCount: number;
  /** Gesetzt bei needs_reindex — kurzer Grund (kein Provider-Internals-Leak). */
  reason?: string;
}

/**
 * Indexiert einen Kurs. Ersetzt ALLE bestehenden Chunks des Kurses (egal
 * welche Version) durch die der übergebenen Version — alte Versionen brauchen
 * wir fürs Retrieval nicht, und das hält die Tabelle beschränkt.
 */
export async function indexCourse(input: IndexCourseInput): Promise<IndexResult> {
  const { courseSlug, version, lessons } = input;

  // 1. Chunking (deterministisch, billig) — inkl. Quiz-Guardrail.
  const pending = lessons.flatMap((lesson) =>
    chunkLessonBody(lesson.body).map((chunk) => ({
      sectionSlug: lesson.sectionSlug,
      lessonSlug: lesson.lessonSlug,
      chunkIndex: chunk.chunkIndex,
      heading: chunk.heading,
      content: chunk.content,
    })),
  );

  // 2. Ohne Key gar nicht erst embedden → needs_reindex (kein Throw).
  if (!isEmbeddingConfigured()) {
    await markState(courseSlug, version, "needs_reindex", 0, "no embedding key");
    return { status: "needs_reindex", chunkCount: 0, reason: "no embedding key" };
  }

  // Leerer Kurs (keine indexierbaren Chunks): sauber als indexed mit 0 Chunks.
  if (pending.length === 0) {
    await replaceChunks(courseSlug, []);
    await markState(courseSlug, version, "indexed", 0, null);
    return { status: "indexed", chunkCount: 0 };
  }

  // 3. Embeddings holen (best-effort).
  let vectors: number[][];
  try {
    const provider = getEmbeddingProvider();
    vectors = await provider.embed(
      pending.map((c) => c.content),
      "document",
    );
  } catch (err) {
    const reason =
      err instanceof EmbeddingError ? err.code : "embedding failed";
    await markState(courseSlug, version, "needs_reindex", 0, reason);
    return { status: "needs_reindex", chunkCount: 0, reason };
  }

  // 4. Schreiben: alte Chunks ersetzen, State auf indexed. Atomar.
  const rows = pending.map((c, i) => ({
    courseSlug,
    sectionSlug: c.sectionSlug,
    lessonSlug: c.lessonSlug,
    version,
    chunkIndex: c.chunkIndex,
    heading: c.heading,
    content: c.content,
    embedding: vectors[i],
  }));

  await replaceChunks(courseSlug, rows);
  await markState(courseSlug, version, "indexed", rows.length, null);
  return { status: "indexed", chunkCount: rows.length };
}

type ChunkRow = typeof schema.lessonChunks.$inferInsert;

/** Ersetzt alle Chunks eines Kurses in einer Transaktion. */
async function replaceChunks(courseSlug: string, rows: ChunkRow[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(schema.lessonChunks)
      .where(sql`${schema.lessonChunks.courseSlug} = ${courseSlug}`);
    // Batched insert, damit ein sehr großer Kurs nicht das Parameter-Limit
    // (postgres: 65535 Bind-Params) sprengt.
    const BATCH = 500;
    for (let i = 0; i < rows.length; i += BATCH) {
      await tx.insert(schema.lessonChunks).values(rows.slice(i, i + BATCH));
    }
  });
}

/** Upsert in course_index_state (eine Zeile pro Kurs). */
async function markState(
  courseSlug: string,
  version: string,
  status: IndexStatus,
  chunkCount: number,
  error: string | null,
): Promise<void> {
  await db
    .insert(schema.courseIndexState)
    .values({ courseSlug, version, status, chunkCount, error })
    .onConflictDoUpdate({
      target: schema.courseIndexState.courseSlug,
      set: {
        version,
        status,
        chunkCount,
        error,
        updatedAt: sql`now()`,
      },
    });
}

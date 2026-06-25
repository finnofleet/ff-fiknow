/**
 * RAG-Retrieval (ADR 0003, Entscheidung 1+2 · Phase 2) — App-seitige
 * Vektor-Suche über den Kurs-Content.
 *
 * Ablauf pro Tutor-Anfrage:
 *   1. Frage embedden (`input_type:"query"` — Voyage-Asymmetrie Query↔Dokument).
 *   2. Alle Chunks des Kurses laden (versions-gekeyt; indexCourse hält pro Kurs
 *      genau eine Version vor) und Cosine in JS rechnen (siehe ./cosine.ts).
 *   3. Top-k nach Score zurückgeben — der Caller (Tutor-Endpoint) wendet die
 *      Relevanz-Schwelle als Scope-Router an (gegroundet vs. allgemein).
 *
 * Kein pgvector, kein ANN-Index — siehe ./cosine.ts für die Begründung. Best-
 * effort gibt es hier NICHT: ein Embedding-Fehler wirft (EmbeddingError), der
 * Endpoint fängt ihn und degradiert sauber auf die statische Lektions-Injektion.
 */
import { eq } from "drizzle-orm";

import { db, schema } from "@/lib/db/client";
import {
  getEmbeddingProvider,
  isEmbeddingConfigured,
} from "@/lib/embeddings";

import { cosineSimilarity } from "./cosine";

/** Default-Anzahl Chunks, die als Kontext in den Prompt gehen. */
export const DEFAULT_TOP_K = 6;

/**
 * Relevanz-Schwelle als **Rausch-Filter** für die Kontext-Injektion: Chunks
 * unter diesem Cosine-Score sind für die Anfrage zu schwach und werden NICHT in
 * den Prompt injiziert. KEIN Scope-Router mehr — die Unterscheidung „aus dem
 * Kurs" vs. „Allgemeinwissen" ist jetzt user-initiiert (Button „Allgemeinwissen
 * ergänzen", mode="general"), nicht schwellenbasiert (der automatische Router
 * feuerte wegen Self-Match der Selektion kaum je out-of-scope).
 *
 * Bleibt nach dem Filter nichts übrig, fällt der Tutor auf die aktuelle Lektion
 * zurück (weiterhin gegroundet). Per Env übersteuerbar (gültig: 0 < x < 1).
 */
export const RELEVANCE_THRESHOLD = (() => {
  const raw = Number(process.env.RAG_RELEVANCE_THRESHOLD);
  return Number.isFinite(raw) && raw > 0 && raw < 1 ? raw : 0.4;
})();

export interface RetrievedChunk {
  sectionSlug: string;
  lessonSlug: string;
  heading: string | null;
  content: string;
  /** Cosine-Ähnlichkeit zur Query in [-1, 1] (praktisch [0, 1]). */
  score: number;
}

export interface RetrievalResult {
  chunks: RetrievedChunk[];
  /** Score des besten Treffers (0, wenn der Index leer ist). */
  topScore: number;
}

/**
 * Embeddet die Query und liefert die Top-k Chunks des Kurses nach Cosine.
 * Wirft `EmbeddingError`, wenn das Query-Embedding scheitert; gibt ein leeres
 * Ergebnis zurück, wenn der Kurs (noch) keine Chunks hat.
 *
 * Voraussetzung: `isEmbeddingConfigured()` — sonst wirft `getEmbeddingProvider`.
 */
export async function retrieveForQuery(
  courseSlug: string,
  query: string,
  topK: number = DEFAULT_TOP_K,
): Promise<RetrievalResult> {
  const rows = await loadCourseChunks(courseSlug);
  if (rows.length === 0) return { chunks: [], topScore: 0 };

  const provider = getEmbeddingProvider();
  const [queryEmbedding] = await provider.embed([query], "query");

  return rankChunks(rows, queryEmbedding, topK);
}

/** Reine Rang-Logik (ohne IO) — getrennt für Testbarkeit. */
export function rankChunks(
  rows: ChunkRow[],
  queryEmbedding: number[],
  topK: number = DEFAULT_TOP_K,
): RetrievalResult {
  const scored = rows.map((r) => ({
    sectionSlug: r.sectionSlug,
    lessonSlug: r.lessonSlug,
    heading: r.heading,
    content: r.content,
    score: cosineSimilarity(queryEmbedding, r.embedding),
  }));

  scored.sort((a, b) => b.score - a.score);
  const chunks = scored.slice(0, Math.max(0, topK));
  return { chunks, topScore: chunks[0]?.score ?? 0 };
}

type ChunkRow = {
  sectionSlug: string;
  lessonSlug: string;
  heading: string | null;
  content: string;
  embedding: number[];
};

/** Lädt alle Chunks eines Kurses (nur die fürs Retrieval nötigen Spalten). */
async function loadCourseChunks(courseSlug: string): Promise<ChunkRow[]> {
  return db
    .select({
      sectionSlug: schema.lessonChunks.sectionSlug,
      lessonSlug: schema.lessonChunks.lessonSlug,
      heading: schema.lessonChunks.heading,
      content: schema.lessonChunks.content,
      embedding: schema.lessonChunks.embedding,
    })
    .from(schema.lessonChunks)
    .where(eq(schema.lessonChunks.courseSlug, courseSlug));
}

/**
 * Liefert den aktuellen Index-Status eines Kurses (für das Grounding-Gating im
 * Endpoint): nur bei `status === "indexed"` und vorhandenem Key lohnt sich der
 * Retrieval-Versuch.
 */
export async function getCourseIndexStatus(
  courseSlug: string,
): Promise<{ status: string; version: string; chunkCount: number } | null> {
  const [row] = await db
    .select({
      status: schema.courseIndexState.status,
      version: schema.courseIndexState.version,
      chunkCount: schema.courseIndexState.chunkCount,
    })
    .from(schema.courseIndexState)
    .where(eq(schema.courseIndexState.courseSlug, courseSlug))
    .limit(1);
  return row ?? null;
}

/** true, wenn für diesen Kurs Retrieval-Grounding überhaupt möglich ist. */
export function canRetrieve(
  status: { status: string; chunkCount: number } | null,
): boolean {
  return (
    isEmbeddingConfigured() &&
    status != null &&
    status.status === "indexed" &&
    status.chunkCount > 0
  );
}

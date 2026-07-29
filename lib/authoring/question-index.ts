/**
 * Frage-Index-Sync (ADR 0009, Phase D1) — ersetzt beim Bundle-Upload ALLE
 * `questions`-Zeilen eines Kurses durch die aus dem aktuellen Bundle
 * geparsten Frage-Blöcke, analog `replaceChunks`/`markState` in
 * `lib/rag/indexing.ts` ("ganzer-Kurs-ersetzen"-Muster: Delete+Insert je
 * Kurs). Der Index wird in D1 befüllt, aber noch von NICHTS gelesen/gerendert
 * (das ist D2) — DORMANT.
 *
 * Bundle bleibt Source of Truth (ADR 0001): `questions` ist ein generierter
 * Drizzle-Index (keine Payload-Collection), kein Schreibpfad in die andere
 * Richtung.
 */
import { sql } from "drizzle-orm";

import { db, schema } from "@/lib/db/client";

import { parseQuestionBlock } from "../quiz/question-parse";
import type { ParsedQuestion } from "./types";

export interface ReplaceQuestionsResult {
  count: number;
}

type QuestionRow = typeof schema.questions.$inferInsert;

/**
 * Parst jeden Frage-Block-Body (`parseQuestionBlock`) und ersetzt die
 * gesamten `questions`-Zeilen des Kurses in EINER Transaktion (Delete+Insert,
 * wie `replaceChunks`). Wirft, wenn ein Block kein `<Question>`-Element
 * enthält (sollte durch `validate-bundle.ts` vorher schon abgefangen sein) —
 * der Aufrufer (`import.ts`) behandelt einen Fehler hier best-effort wie den
 * RAG-Index: loggen, Upload NICHT hart abbrechen.
 */
export async function replaceQuestions(
  courseSlug: string,
  version: string,
  blocks: ParsedQuestion[],
): Promise<ReplaceQuestionsResult> {
  const rows: QuestionRow[] = blocks.map((block) => {
    const parsed = parseQuestionBlock(block.body);
    if (!parsed) {
      throw new Error(
        `Frage-Block "${block.slug}" enthält kein <Question>-Element.`,
      );
    }
    return {
      courseSlug,
      version,
      questionSlug: block.slug,
      prompt: parsed.prompt,
      type: parsed.type,
      options: parsed.options,
      explanation: parsed.explanation,
      tags: block.tags,
    };
  });

  await db.transaction(async (tx) => {
    await tx
      .delete(schema.questions)
      .where(sql`${schema.questions.courseSlug} = ${courseSlug}`);
    // Batched insert, damit ein sehr großer Kurs nicht das Parameter-Limit
    // (postgres: 65535 Bind-Params) sprengt (wie replaceChunks).
    const BATCH = 500;
    for (let i = 0; i < rows.length; i += BATCH) {
      await tx.insert(schema.questions).values(rows.slice(i, i + BATCH));
    }
  });

  return { count: rows.length };
}

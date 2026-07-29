/**
 * Index-Loader fuer Fragen-Pool-Praefungen (ADR 0009, D2-ii-a) — I/O-Schicht,
 * die den generierten `questions`-Index (D1, `lib/db/schema.ts`) liest und zu
 * `PoolQuestion[]` (siehe `lib/quiz/pool.ts`) mappt.
 *
 * Bewusst getrennt von `lib/quiz/pool.ts` (rein, kein I/O): dieses Modul zieht
 * Drizzle/Postgres — die Auswahl-/Grading-Logik bleibt testbar ohne DB.
 */
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { questions } from "@/lib/db/schema";

import type { PoolQuestion } from "./pool";

type QuestionOption = { label: string; correct: boolean };

/**
 * Laedt die Fragen zu `slugs` aus dem `questions`-Index fuer
 * `(courseSlug, version)` und liefert sie GENAU in der Reihenfolge von
 * `slugs` zurueck (nicht in DB-Reihenfolge — `slugs` ist bereits die per Seed
 * gezogene Render-/Versuchs-Reihenfolge, siehe `selectPoolQuestions`).
 *
 * Fehlende Slugs (z. B. Index-Drift nach Bundle-Aenderung) werden defensiv
 * uebersprungen statt zu werfen — das Ergebnis kann also kuerzer als `slugs`
 * sein.
 */
export async function getPoolQuestions(
  courseSlug: string,
  version: string,
  slugs: string[],
): Promise<PoolQuestion[]> {
  if (slugs.length === 0) return [];

  const rows = await db
    .select()
    .from(questions)
    .where(
      and(
        eq(questions.courseSlug, courseSlug),
        eq(questions.version, version),
        inArray(questions.questionSlug, slugs),
      ),
    );

  const bySlug = new Map(rows.map((row) => [row.questionSlug, row]));

  const result: PoolQuestion[] = [];
  for (const slug of slugs) {
    const row = bySlug.get(slug);
    if (!row) continue; // defensiv: fehlender Slug wird uebersprungen
    result.push({
      slug: row.questionSlug,
      prompt: row.prompt,
      type: row.type === "multi" ? "multi" : "single",
      options: (row.options as QuestionOption[] | null) ?? [],
      explanation: row.explanation,
    });
  }
  return result;
}

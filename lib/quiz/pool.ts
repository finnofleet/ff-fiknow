/**
 * Reiner, I/O-freier Kern fuer deterministische Fragen-Pool-Auswahl + Grading
 * (ADR 0009, D2, Phase 7c).
 *
 * Hintergrund: Ein Abschlusstest kann statt einer festen Fragenliste einen
 * POOL von M Fragen-Slugs deklarieren (`question_pool`) plus
 * `questions_per_attempt: N`. Pro Versuch werden N Fragen deterministisch per
 * SEED aus dem Pool gezogen — gleicher Seed liefert immer dieselbe Auswahl
 * UND Reihenfolge (Reproduzierbarkeit fuer Support/Audit/Tests), waehrend
 * verschiedene Seeds (z. B. pro Versuch) unterschiedliche Ziehungen erlauben.
 *
 * Die Fragen selbst liegen strukturiert im `questions`-Index (D1:
 * `{ slug, prompt, type, options: [{label, correct}] }`) statt als MDX wie
 * beim klassischen Abschlusstest. Das Grading uebernimmt trotzdem dieselbe
 * Bewertungssemantik wie `lib/quiz/exam-grade.ts`: server-seitig gegen die
 * strukturierten `correct`-Flags, exakter Set-Match via `isAnswerCorrect`
 * aus `lib/quiz/grade.ts`. Client-gemeldete `correct`/`isCorrect`/`score`
 * werden nicht gelesen (Integritaet).
 *
 * Bewusst ohne React/DOM/DB/Payload: nur Pool + Seed rein, Auswahl/Ergebnis
 * raus.
 */
import { isAnswerCorrect } from "./grade";

export type PoolQuestion = {
  slug: string;
  prompt: string;
  type: "single" | "multi";
  options: { label: string; correct: boolean }[];
};

export type PoolGradeResult = {
  total: number;
  correct: number;
  score: number;
  passed: boolean;
  perQuestion: { slug: string; prompt: string; isCorrect: boolean }[];
};

/**
 * xmur3 — einfacher, deterministischer String-Hash auf 32 Bit. Erzeugt aus
 * dem Seed-String einen Generator, dessen erster Aufruf den Startzustand
 * fuer den PRNG (mulberry32) liefert. Nicht kryptographisch, nur fuer
 * reproduzierbare (nicht sicherheitskritische) Zufallsauswahl gedacht.
 */
function xmur3(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/**
 * mulberry32 — kleiner, schneller, deterministischer PRNG (32-Bit-State).
 * Liefert bei gleichem `seedInt` immer dieselbe Folge von Fliesskommazahlen
 * in [0, 1). Wird hier mit dem aus `xmur3(seed)()` gewonnenen Startwert
 * initialisiert (String-Seed -> 32-Bit-Hash -> PRNG-State).
 */
function mulberry32(seedInt: number): () => number {
  let a = seedInt;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Waehlt deterministisch `count` Fragen-Slugs aus `poolSlugs` aus.
 *
 * Algorithmus:
 * 1. `poolSlugs` wird dedupliziert (erstes Vorkommen zaehlt, stabile
 *    Reihenfolge) — Duplikate im Pool duerfen die Auswahl nicht verzerren.
 * 2. Aus dem `seed`-String wird via `xmur3` ein 32-Bit-Hash gewonnen, der
 *    `mulberry32` initialisiert (String-Seed -> deterministischer PRNG).
 * 3. Die deduplizierte Kopie wird per Fisher-Yates-Shuffle (mit dem
 *    geseedeten PRNG statt Math.random) einmal komplett gemischt.
 * 4. Die ersten `min(count, len)` Elemente der gemischten Liste werden
 *    zurueckgegeben — diese Reihenfolge ist zugleich die spaetere
 *    Render-Reihenfolge im Versuch.
 *
 * `count <= 0` liefert `[]`. Gleiche (poolSlugs, count, seed) liefern immer
 * dasselbe Ergebnis-Array (KEIN Math.random, keine Uhrzeit-Abhaengigkeit).
 */
export function selectPoolQuestions(
  poolSlugs: string[],
  count: number,
  seed: string,
): string[] {
  if (count <= 0) return [];

  // Stabile Deduplizierung: erstes Vorkommen behaelt seine Position.
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const slug of poolSlugs) {
    if (!seen.has(slug)) {
      seen.add(slug);
      deduped.push(slug);
    }
  }

  const seedInt = xmur3(seed)();
  const rand = mulberry32(seedInt);

  // Fisher-Yates-Shuffle auf einer Kopie, mit geseedetem PRNG.
  const shuffled = [...deduped];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled.slice(0, Math.min(count, shuffled.length));
}

export type PoolSubmission = { prompt: string; selected: number[] };

/**
 * Bewertet einen Pool-basierten Versuch server-seitig. `selected` sind die
 * fuer DIESEN Versuch gezogenen Fragen (Ergebnis von
 * `selectPoolQuestions`, als volle `PoolQuestion`-Objekte aufgeloest) — nur
 * diese zaehlen, nicht der gesamte Pool.
 *
 * Matching Submission -> Frage erfolgt ueber exakten `prompt`-String-Match.
 * Fehlt zu einer gezogenen Frage eine Submission, gilt sie als nicht
 * beantwortet (isCorrect: false).
 *
 * NUR `submission.selected` wird gelesen (Integritaet) — vom Client
 * mitgeschickte `correct`/`isCorrect`/`score`-Felder haben keinen Einfluss;
 * die korrekten Antworten kommen ausschliesslich aus den server-seitig
 * geladenen `options[].correct`-Flags der `selected`-Fragen.
 */
export function gradePoolAttempt(
  selected: PoolQuestion[],
  submitted: PoolSubmission[],
  passingScore: number,
): PoolGradeResult {
  const byPrompt = new Map<string, PoolSubmission>();
  for (const s of submitted) {
    byPrompt.set(s.prompt, s);
  }

  const perQuestion = selected.map((question) => {
    const submission = byPrompt.get(question.prompt);
    if (!submission) {
      return { slug: question.slug, prompt: question.prompt, isCorrect: false };
    }
    const correctFlags = question.options.map((o) => o.correct);
    const isCorrect = isAnswerCorrect(correctFlags, new Set(submission.selected));
    return { slug: question.slug, prompt: question.prompt, isCorrect };
  });

  const total = selected.length;
  const correct = perQuestion.filter((q) => q.isCorrect).length;
  const score = total > 0 ? correct / total : 0;
  const passed = total > 0 && score >= passingScore;

  return { total, correct, score, passed, perQuestion };
}

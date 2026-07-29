import postgres from "postgres";

import { expect, test } from "@playwright/test";

import { E2E_BOOT_ENV } from "./env";

/**
 * ADR 0009 D2-ii-b — Fragen-Pool-Abschlusstest end-to-end: Ziehung aus dem
 * `questions`-Index -> Render -> Submit -> server-seitiges Grading.
 *
 * e2e/seed.ts legt dafuer einen eigenen, isolierten Kurs an (`pool-demo`,
 * NICHT `datenschutz-grundlagen` — der wird von quiz.spec.ts/final-exam.spec.ts
 * gebraucht) mit einer Abschlusstest-Lesson (`finalExam: true`), die einen
 * Fragen-Pool aus 3 Fragen (`pq1`/`pq2`/`pq3`, questionsPerAttempt: 2)
 * deklariert. Die 3 Fragen liegen direkt als `questions`-Index-Zeilen in
 * Postgres (nicht im Lesson-Body — genau das Merkmal einer Pool-Praefung).
 * Jede Frage hat genau eine korrekte Option, deren Label eindeutig "KORREKT"
 * enthaelt (falsche Optionen: "FALSCH-a"/"FALSCH-b").
 *
 * Die Ziehung (`selectPoolQuestions`, seed = randomUUID() pro Seiten-Render,
 * siehe app/(frontend)/learn/.../page.tsx) ist bewusst nicht deterministisch
 * ueber Testlaeufe hinweg — der Test darf sich NICHT darauf verlassen, WELCHE
 * 2 von 3 Fragen gezogen werden. Er prueft stattdessen: es werden GENAU 2
 * Fragen gerendert, und fuer beide (unabhaengig davon, welche es sind) laesst
 * sich die korrekte Option ueber den Text "KORREKT" finden und klicken.
 *
 * User-Identitaet: das `learner`-Projekt laeuft mit dem Dana-storageState
 * (DANA_ID unten, siehe e2e/seed.ts).
 *
 * Negativ-Fall (falsche Antworten -> passed=false) ist hier BEWUSST NICHT
 * als zweiter e2e-Test aufgenommen:
 *   - Ein zweiter Versuch derselben Lesson im selben Spec-Lauf wuerde einen
 *     zweiten `quiz_attempts`-Eintrag fuer (Dana, pool-demo, final) erzeugen;
 *     das robuste "juengster Versuch"-Muster (ORDER BY attempted_at DESC,
 *     wie in final-exam.spec.ts) funktioniert zwar bei serieller Ausfuehrung
 *     innerhalb einer Datei, macht den Test aber empfindlicher gegenüber
 *     spaeteren Umbauten (z. B. `fullyParallel`/Retries), ohne zusaetzlichen
 *     Erkenntnisgewinn zu bringen.
 *   - Das server-seitige Grading selbst (inkl. "falsch -> passed=false",
 *     "nicht beantwortet -> falsch", passingScore-Grenzfaelle) ist bereits
 *     durch lib/quiz/pool.test.ts (gradePoolAttempt) vollstaendig abgedeckt.
 *     Der e2e-Mehrwert eines zweiten Falls hier waere primaer "kann man den
 *     Submit-Button auch bei falschen Antworten klicken" — das prueft bereits
 *     final-exam.spec.ts fuer den inline-Abschlusstest-Zwilling.
 *   - Dieser Test deckt daher den Teil ab, den NUR ein echter e2e kann: die
 *     Pool-Ziehung aus dem Index, den Render-Pfad (pool-loader -> pool-render
 *     -> MDXRemote) und das server-seitige Neubewerten gegen den Index (nicht
 *     gegen Client-Werte) im positiven Fall.
 */
const DANA_ID = "22222222-2222-2222-2222-222222222222";
const POOL_COURSE_SLUG = "pool-demo";
const POOL_SECTION_SLUG = "pruefung";
const POOL_LESSON_SLUG = "final";
const POOL_QUESTIONS_PER_ATTEMPT = 2;

test.describe("Pool-Abschlusstest — Ziehung + Server-Grading", () => {
  test("2 von 3 Pool-Fragen gerendert, korrekte Antworten -> server-seitig bestanden", async ({
    page,
  }) => {
    await page.goto(`/learn/${POOL_COURSE_SLUG}/${POOL_SECTION_SLUG}/${POOL_LESSON_SLUG}`);

    // Genau questionsPerAttempt (2) von 3 Pool-Fragen werden gerendert —
    // robust gegen WELCHE 2 gezogen wurden (Prompt-Text ist je Frage
    // eindeutig: "Pool-Frage 1"/"2"/"3", siehe e2e/seed.ts).
    await expect(page.getByText(/Pool-Frage/)).toHaveCount(POOL_QUESTIONS_PER_ATTEMPT);

    // Fuer JEDE gerenderte Frage die korrekte Option klicken — unabhaengig
    // davon, welche 2 von 3 Fragen gezogen wurden: die korrekte Option ist
    // immer die, deren Label den Text "KORREKT" enthaelt. Beide Fragen sind
    // vom Typ "single" (question.tsx), ein Klick sendet die Frage sofort ab.
    const correctButtons = await page.getByRole("button", { name: /KORREKT/ }).all();
    expect(correctButtons.length).toBe(POOL_QUESTIONS_PER_ATTEMPT);
    for (const button of correctButtons) {
      await button.click();
    }

    // Sofort-Feedback: beide beantworteten Fragen zeigen "Richtig" (rein
    // clientseitig, unabhaengig vom Server — analog quiz.spec.ts).
    await expect(page.getByText("Richtig", { exact: true })).toHaveCount(
      POOL_QUESTIONS_PER_ATTEMPT,
    );

    // Quiz abschicken — einzige Lektion des Kurses (kein "next"), Button-
    // Label endet auf "Kurs abschliessen"; robuste Regex wie in
    // final-exam.spec.ts. Loest die Server-Action aus, die server-seitig aus
    // dem questions-Index neu bewertet (gradePoolAttempt) und danach
    // redirected.
    await page.getByRole("button", { name: /Quiz abschicken/ }).click();
    await page.waitForURL(new RegExp(`/courses/${POOL_COURSE_SLUG}`));

    const sql = postgres(E2E_BOOT_ENV.DATABASE_URL, { max: 1 });
    try {
      const attempts = await sql<{ passed: boolean; score: number }[]>`
        SELECT passed, score
        FROM quiz_attempts
        WHERE user_id = ${DANA_ID}
          AND course_slug = ${POOL_COURSE_SLUG}
          AND section_slug = ${POOL_SECTION_SLUG}
          AND lesson_slug = ${POOL_LESSON_SLUG}
        ORDER BY attempted_at DESC
        LIMIT 1
      `;
      expect(attempts.length).toBeGreaterThan(0);
      // Server-seitig gegen den questions-Index neu bewertet (gradePoolAttempt,
      // NICHT gegen die vom Client gemeldeten answers/score/passed-Werte) —
      // beide korrekt beantwortet -> bestanden.
      expect(attempts[0]?.passed).toBe(true);
      expect(attempts[0]?.score ?? 0).toBeGreaterThanOrEqual(0.5);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
});

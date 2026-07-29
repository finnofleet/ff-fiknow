import postgres from "postgres";

import { expect, test } from "@playwright/test";

import { E2E_BOOT_ENV } from "./env";

/**
 * ADR 0005 Phase 7a — Abschlusstest (`finalExam`): server-seitige Bewertung +
 * "durchgefallen markiert Lektion trotzdem erledigt"-Bugfix.
 *
 * e2e/seed.ts markiert die bestehende Quiz-Lesson (`quiz-bausteine`,
 * QUIZ_BODY = eine Single-Frage mit genau einer korrekten Option) zusätzlich
 * als `finalExam: true` — der einfachste Weg, ohne eine zweite Lesson
 * anzulegen. Der "richtige Antwort ⇒ passed/erledigt"-Pfad ist bereits durch
 * quiz.spec.ts abgedeckt (klickt die korrekte Antwort, prüft nur das
 * clientseitige Sofort-Feedback — NIE den Submit-Button, deshalb bleibt jener
 * Test von `finalExam: true` unberührt). Dieser Test deckt den GEGENTEIL-Pfad
 * ab: falsche Antwort ⇒ server-seitig `passed = false` ⇒ Lektion NICHT
 * erledigt.
 *
 * User-Identität: Das `learner`-Projekt läuft mit dem Dana-storageState
 * (e2e/seed.ts, DANA_ID = "22222222-2222-2222-2222-222222222222"). Dana hat
 * laut Seed nur die REALE Lektion (`was-ist-datenschutz`) als completed
 * markiert bekommen, NICHT `quiz-bausteine` — und kein anderer Spec im
 * `learner`-Projekt klickt den Quiz-Submit-Button (quiz.spec.ts prüft nur das
 * Options-Feedback). Wir müssen den User daher nicht extra frisch seeden;
 * stattdessen prüfen wir robust den JÜNGSTEN quiz_attempts-Eintrag (ORDER BY
 * attempted_at DESC) für Dana + diese Lesson, statt uns auf "es gibt genau
 * einen Versuch" zu verlassen.
 */
const DANA_ID = "22222222-2222-2222-2222-222222222222";
const COURSE_SLUG = "datenschutz-grundlagen";
const SECTION_SLUG = "grundlagen";
const QUIZ_LESSON_SLUG = "quiz-bausteine";

test.describe("Abschlusstest — server-seitiges Grading (durchgefallen)", () => {
  test("falsche Antwort: Feedback 'Nicht ganz', Versuch passed=false, Lektion NICHT completed", async ({
    page,
  }) => {
    await page.goto(`/learn/${COURSE_SLUG}/${SECTION_SLUG}/${QUIZ_LESSON_SLUG}`);

    await expect(page.getByText("Was ist ein Repository?")).toBeVisible();

    // Bewusst eine FALSCHE Option klicken (die korrekte ist "Die zentrale
    // Projekt-Ablage …" — siehe QUIZ_BODY in e2e/seed.ts).
    await page
      .getByRole("button", { name: /eine einzelne, aktuelle Datei/i })
      .click();

    // Clientseitiges Sofort-Feedback (question.tsx) — unabhängig vom Server.
    await expect(page.getByText("Nicht ganz")).toBeVisible();

    // Quiz abschicken (letzte Lektion des Kurses → kein "next", Button-Label
    // endet auf "Kurs abschließen") — löst die Server-Action aus, die
    // server-seitig neu bewertet (gradeExam) und danach redirected.
    await page.getByRole("button", { name: /Quiz abschicken/ }).click();
    await page.waitForURL(new RegExp(`/courses/${COURSE_SLUG}`));

    const sql = postgres(E2E_BOOT_ENV.DATABASE_URL, { max: 1 });
    try {
      const attempts = await sql<{ passed: boolean }[]>`
        SELECT passed
        FROM quiz_attempts
        WHERE user_id = ${DANA_ID}
          AND course_slug = ${COURSE_SLUG}
          AND section_slug = ${SECTION_SLUG}
          AND lesson_slug = ${QUIZ_LESSON_SLUG}
        ORDER BY attempted_at DESC
        LIMIT 1
      `;
      expect(attempts.length).toBeGreaterThan(0);
      // Server-seitig neu bewertet — die falsche Auswahl darf NIE als
      // bestanden durchrutschen, unabhängig davon, was der Client behauptet
      // hätte.
      expect(attempts[0]?.passed).toBe(false);

      const completed = await sql<{ n: number }[]>`
        SELECT count(*)::int AS n
        FROM lesson_progress
        WHERE user_id = ${DANA_ID}
          AND course_slug = ${COURSE_SLUG}
          AND section_slug = ${SECTION_SLUG}
          AND lesson_slug = ${QUIZ_LESSON_SLUG}
          AND status = 'completed'
      `;
      // Bugfix-Kern: ein durchgefallener Abschlusstest markiert die Lektion
      // NICHT als erledigt.
      expect(completed[0]?.n ?? 0).toBe(0);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
});

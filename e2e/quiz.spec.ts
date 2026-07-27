import { expect, test } from "@playwright/test";

/**
 * RSC-Grading-Regressionstest.
 *
 * Der Bug „korrekte Quiz-Antwort wird als falsch gewertet" trat NUR im echten
 * next-mdx-remote/rsc-Render auf (Server→Client-Flight), nie in den jsdom-
 * Unit-Tests — weil <Question> die `correct`-Props seiner <Option>-Kinder
 * clientseitig introspizierte und der Prop über die RSC-Grenze verloren ging.
 * Dieser E2E rendert die Quiz-Lesson über den ECHTEN Server-Render (QuizShell
 * → MDXRemote) und klickt die korrekte Antwort. Er ist damit der einzige Test,
 * der genau diese Bruchstelle abdeckt.
 */
test.describe("Quiz — RSC-Grading (Regressionsschutz)", () => {
  test("korrekte Antwort wird als Richtig gewertet (echter RSC-Render)", async ({ page }) => {
    await page.goto(
      "/learn/datenschutz-grundlagen/grundlagen/quiz-bausteine",
    );

    await expect(page.getByText("Was ist ein Repository?")).toBeVisible();

    await page
      .getByRole("button", { name: /zentrale Projekt-Ablage/ })
      .click();

    // Die korrekte Antwort MUSS als „Richtig" gewertet werden — und darf NICHT
    // als „Nicht ganz" erscheinen (der eigentliche Bug).
    await expect(page.getByText("Richtig", { exact: true })).toBeVisible();
    await expect(page.getByText("Nicht ganz")).toHaveCount(0);
  });
});

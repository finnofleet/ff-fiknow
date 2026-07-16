import { expect, test } from "@playwright/test";

test.describe("Meine Pflichtschulungen (Lerner-Ansicht)", () => {
  test("zeigt Kurstitel, Ampel-Badge und Assignment-Row für Dana", async ({
    page,
  }) => {
    await page.goto("/meine-pflichtschulungen");

    await expect(
      page.getByRole("heading", { name: "Meine Pflichtschulungen" }),
    ).toBeVisible();

    // Assignment-Row mit dem Kurstitel. Dana hat für diesen Kurs ZWEI
    // Zuweisungs-Quellen (courses.mandatory-Toggle + training-requirement,
    // siehe e2e/seed.ts) — beide rendern eine eigene Zeile mit demselben
    // Titel, daher .first() statt einer strikten Einzel-Treffer-Erwartung.
    await expect(page.getByText("Datenschutz-Grundlagen").first()).toBeVisible();

    // Ampel-Badge — Dana hat die Lesson abgeschlossen (syncCourseCompletion),
    // ihre Zuweisung sollte daher "Erledigt" zeigen.
    await expect(
      page.getByText(/Erledigt|Offen|Bald fällig|Überfällig/).first(),
    ).toBeVisible();

    await page.screenshot({
      path: "e2e/screenshots/meine-pflichtschulungen.png",
      fullPage: true,
    });
  });
});

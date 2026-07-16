import { expect, test } from "@playwright/test";

test.describe("Pflichtkurse — Compliance-Dashboard (Kurator-Ansicht)", () => {
  test("zeigt Kurstitel, Erfüllungsquote und Teilnehmer-Tabelle", async ({
    page,
  }) => {
    await page.goto("/manage/pflichtkurse");

    await expect(page.getByRole("heading", { name: "Pflichtkurse" })).toBeVisible();

    // Kurstitel als h2-Card-Heading — bewusst per Rolle statt getByText, weil
    // die darunterliegende Slug-Zeile ("datenschutz-grundlagen") mit
    // case-insensitivem Substring-Matching sonst ebenfalls träfe.
    await expect(
      page.getByRole("heading", { name: "Datenschutz-Grundlagen" }),
    ).toBeVisible();

    // Quote-Badge enthält ein Prozentzeichen (styles.quotePct).
    await expect(page.getByText(/%/).first()).toBeVisible();

    // Die Teilnehmer-Tabelle sitzt in einem <details>, per default eingeklappt
    // — erst aufklappen, dann assertieren + screenshotten (sonst zeigt der
    // Screenshot eine leere Tabelle).
    await page.getByText(/Teilnehmer:innen anzeigen/).click();

    const rows = page.locator("table tbody tr");
    await expect(rows.first()).toBeVisible();
    // Nenner ist "zugewiesene Teilnehmer:innen" (lib/training/compliance-compute.ts):
    // der courses.mandatory-Toggle zielt auf ALLE nicht gesperrten Profile
    // (also auch Cora, die Kuratorin), die training-requirement nur auf
    // Lerner — dedupliziert macht das mindestens die 4 Lerner + Cora. Wir
    // pinnen uns nicht auf eine exakte Zahl fest (spec verlangt nur ≥1),
    // sondern prüfen, dass mindestens die vier Lerner-Zeilen da sind.
    expect(await rows.count()).toBeGreaterThanOrEqual(4);

    await expect(page.getByRole("cell", { name: "Dana" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Enno" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Pia" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Nino" })).toBeVisible();

    await page.screenshot({
      path: "e2e/screenshots/compliance-dashboard.png",
      fullPage: true,
    });
  });
});

import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const authPath = (name: string) => path.resolve(__dirname, ".auth", name);

/**
 * ADR 0007 P2b/P3 — Autorisierung end-to-end.
 *
 * Spielt durch, WAS SICHTBAR ist und WAS NICHT, wenn eine Person von der
 * Single-Role auf explizite Grants (role_assignments) wechselt. Deckt genau
 * die Verdrahtung ab, die die Unit-Tests NICHT sehen: dass die Loader/Gates
 * die role_assignments zur Laufzeit wirklich lesen und korrekt filtern
 * (echte Postgres, echter RSC-Render). Rhea/Leon sind per Session-Rolle
 * `learner` (duerfen also per Single-Role nichts) — ihre Rechte kommen
 * ausschliesslich aus den geseedeten Zuweisungen.
 */

test.describe("Scoped named viewer (HR, Scope CH)", () => {
  test.use({ storageState: authPath("rhea.json") });

  test("sieht CH-Teilnehmer, aber NICHT DE (Session-Rolle nur learner)", async ({
    page,
  }) => {
    await page.goto("/manage/pflichtkurse");

    // Namentliche Sicht (NICHT die Aggregat-Ueberschrift).
    await expect(
      page.getByRole("heading", { name: "Pflichtkurse", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Datenschutz-Grundlagen" }),
    ).toBeVisible();

    await page.getByText(/Teilnehmer:innen anzeigen/).click();

    // CH sichtbar …
    await expect(page.getByRole("cell", { name: "Dana" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Enno" })).toBeVisible();
    // … DE NICHT (Scope CH filtert sie raus).
    await expect(page.getByRole("cell", { name: "Pia" })).toHaveCount(0);
    await expect(page.getByRole("cell", { name: "Nino" })).toHaveCount(0);
  });
});

test.describe("Aggregate-only viewer (Leitung, group)", () => {
  test.use({ storageState: authPath("leon.json") });

  test("bekommt die PII-freie Aggregat-Sicht — Zahlen je Land, KEINE Namen", async ({
    page,
  }) => {
    await page.goto("/manage/pflichtkurse");

    // Aggregat-Sicht (eigene Ueberschrift), nicht die Namenstabelle.
    await expect(
      page.getByRole("heading", { name: "Pflichtkurse — Aggregat" }),
    ).toBeVisible();

    // CH erreicht die k-Anon-Schwelle (5) -> sichtbarer Bucket mit Zahlen.
    await expect(
      page.getByRole("cell", { name: "CH", exact: true }),
    ).toBeVisible();
    // DE (2 Personen) < 5 -> unterdrueckt.
    await expect(page.getByText(/unterdrueckt/).first()).toBeVisible();

    // KEIN einziger Teilnehmer-Name darf auftauchen (PII-frei, §9).
    for (const name of ["Dana", "Enno", "Pia", "Nino", "Anja", "Bea", "Ced"]) {
      await expect(page.getByText(name, { exact: true })).toHaveCount(0);
    }
  });
});

test.describe("Ohne Compliance-Capability", () => {
  test.use({ storageState: authPath("learner.json") });

  test("Lerner ohne Grant wird weggeleitet (kein Zugang)", async ({ page }) => {
    await page.goto("/manage/pflichtkurse");
    // Ein Lerner ohne jede Capability wird bereits vom /manage-Layout-Gate
    // abgewiesen (leerer Cap-Satz) — noch vor der Compliance-Page. Er sieht
    // definitiv keine Compliance-Daten.
    await expect(page).toHaveURL(/\/dashboard\?error=no_admin_access/);
    await expect(
      page.getByRole("heading", { name: "Pflichtkurse", exact: true }),
    ).toHaveCount(0);
  });
});

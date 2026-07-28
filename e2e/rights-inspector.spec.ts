import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const authPath = (name: string) => path.resolve(__dirname, ".auth", name);

// Muss zum Seed passen (e2e/seed.ts): Rhea = HR-regional, view-named, Scope CH.
const RHEA_ID = "a7a7a7a7-7777-7777-7777-777777777777";

/**
 * ADR 0007 P5a — Rechte-Inspektor (§8). Prueft, dass ein Admin (users:manage)
 * die effektiven Rechte + den aufgeloesten Sicht-Scope eines scoped Users
 * sieht, und dass ein Betrachter OHNE users:manage keinen Zugang bekommt.
 */
test.describe("Rechte-Inspektor (Admin)", () => {
  test.use({ storageState: authPath("adam.json") });

  test("zeigt effektive Capability + aufgeloesten Scope eines scoped Users", async ({
    page,
  }) => {
    await page.goto("/manage/rechte?user=" + RHEA_ID);

    await expect(
      page.getByRole("heading", { name: "Rechte-Inspektor" }),
    ).toBeVisible();

    // Rhea traegt compliance:view-named (aus role_assignment hr-regional) …
    await expect(page.getByText("compliance:view-named").first()).toBeVisible();
    // … und ihr Sicht-Scope loest zu CH / alle BUs auf (Scope {land:[CH]}).
    await expect(page.getByText(/CH \/ alle BUs/).first()).toBeVisible();
  });
});

test.describe("Rechte-Inspektor — Zugang", () => {
  test.use({ storageState: authPath("curator.json") });

  test("Kurator ohne users:manage wird abgewiesen", async ({ page }) => {
    await page.goto("/manage/rechte");
    await expect(page).toHaveURL(/error=no_rights_inspector/);
  });
});

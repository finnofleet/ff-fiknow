import postgres from "postgres";

import { expect, test } from "@playwright/test";

import { E2E_BOOT_ENV } from "./env";

/**
 * ADR 0007 P4 — beweist den Audit-SCHREIBPFAD end-to-end.
 *
 * `recordAudit` ist best-effort und SCHLUCKT Insert-Fehler — ein kaputtes
 * Insert (z. B. falscher Spaltentyp) waere sonst ein STILLER No-Op, den weder
 * tsc noch die Unit-Tests sehen. Dieser Test schaltet ueber das im E2E-Lauf
 * aktivierte Compliance-Zugriffs-Logging (AUDIT_COMPLIANCE_ACCESS=true) einen
 * echten recordAudit-Call scharf und prueft direkt in der Postgres, dass die
 * Zeile tatsaechlich in `audit_log` landet.
 */
test.describe("Audit-Log — Schreibpfad (Compliance-Zugriff)", () => {
  test("Dashboard-Aufruf als Kurator schreibt eine compliance.view-named-Zeile", async ({
    page,
  }) => {
    await page.goto("/manage/pflichtkurse");
    await expect(
      page.getByRole("heading", { name: "Pflichtkurse", exact: true }),
    ).toBeVisible();

    // Der Server-Render awaitet recordAudit VOR der Response — die Zeile ist
    // also da, sobald die Seite geladen ist. Direkt gegen die E2E-Postgres
    // pruefen (dieselbe Instanz, die die App beschreibt).
    const sql = postgres(E2E_BOOT_ENV.DATABASE_URL, { max: 1 });
    try {
      const rows = await sql<{ n: number }[]>`
        SELECT count(*)::int AS n
        FROM audit_log
        WHERE action = 'compliance.view-named' AND source = 'session'
      `;
      expect(rows[0]?.n ?? 0).toBeGreaterThan(0);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
});

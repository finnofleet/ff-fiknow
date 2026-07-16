/**
 * Gemeinsamer Boot-Env-Block für den E2E-Lauf — MUSS identisch sein zwischen
 * global-setup.ts (Migrations-/Seed-Subprozesse) und dem Playwright
 * `webServer` (playwright.config.ts). Ein Diff hier führt dazu, dass die App
 * gegen eine andere Config startet als die, gegen die migriert/geseedet
 * wurde (siehe AGENTS-Auftrag: OIDC_ISSUER/CLIENT_ID/CLIENT_SECRET werden bei
 * JEDEM Request geprüft, PAYLOAD_SECRET signiert die Test-Cookies).
 */
export const E2E_BOOT_ENV: Record<string, string> = {
  DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:55433/fiknow?sslmode=disable",
  PAYLOAD_SECRET: "e2e-test-secret-mindestens-16-zeichen",
  OIDC_ISSUER: "http://localhost/dummy",
  OIDC_CLIENT_ID: "e2e",
  OIDC_CLIENT_SECRET: "e2e",
  OIDC_REDIRECT_BASE: "http://localhost:3100",
  SKIP_MIGRATIONS: "true",
};

export const E2E_PG_CONTAINER = "fiknow-e2e-pg";
export const E2E_PG_PORT = 55433;
export const E2E_BASE_URL = "http://localhost:3100";
export const E2E_DEV_SERVER_PORT = 3100;

/**
 * Where global-setup.ts records the PID of the `next dev` process it spawns,
 * so global-teardown.ts can kill it even though it runs as a separate
 * lifecycle callback. Gitignored (lives under e2e/.auth alongside the other
 * generated E2E artifacts).
 */
export const E2E_DEV_SERVER_PIDFILE = "e2e/.auth/dev-server.pid";


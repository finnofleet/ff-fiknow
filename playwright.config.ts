import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";

import { E2E_BASE_URL } from "./e2e/env";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  globalSetup: path.resolve(__dirname, "e2e/global-setup.ts"),
  globalTeardown: path.resolve(__dirname, "e2e/global-teardown.ts"),
  reporter: "list",
  use: {
    baseURL: E2E_BASE_URL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  // NOTE: no `config.webServer` here — Playwright 1.61 starts the webServer
  // plugin task BEFORE globalSetup runs (verified against
  // node_modules/playwright/lib/runner/index.js createGlobalSetupTasks()),
  // which would boot `next dev` against a Postgres instance that doesn't
  // exist yet. Instead, global-setup.ts spawns + waits for `next dev`
  // itself, AFTER Postgres is up, migrated, and seeded. global-teardown.ts
  // kills it again. See comments in e2e/global-setup.ts for details.
  projects: [
    {
      // Anonym (kein storageState) — prüft, dass die Payload-API/Media
      // ohne Login gesperrt ist (proxy.ts).
      name: "anon",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /api-gating\.spec\.ts/,
    },
    {
      name: "learner",
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.resolve(__dirname, "e2e/.auth/learner.json"),
      },
      testMatch: /meine-pflichtschulungen\.spec\.ts/,
    },
    {
      name: "curator",
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.resolve(__dirname, "e2e/.auth/curator.json"),
      },
      // api-gating läuft hier zusätzlich, um zu prüfen, dass eingeloggte
      // Requests NICHT geblockt werden.
      testMatch: /(compliance|api-gating)\.spec\.ts/,
    },
  ],
});

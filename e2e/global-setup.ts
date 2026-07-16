/**
 * Playwright globalSetup — bringt eine frische Postgres-Instanz + migrierte
 * Schemas + Seed-Daten hoch, BEVOR die App-Server-Instanz startet und BEVOR
 * irgendeine Spec läuft.
 *
 * Reihenfolge (siehe AGENTS-Auftrag):
 *   1. Docker-Container fiknow-e2e-pg (postgres:16) neu starten
 *   2. Warten bis pg_isready
 *   3. auth-Schema-Bootstrap (payload-Schema + auth.uid()/auth.role())
 *   4. `drizzle-kit migrate` (mit Retry gegen bekannte Erst-Lauf-Flakiness)
 *   5. `payload migrate`
 *   6. `npx tsx e2e/seed.ts` — Seed-Daten + storageState-Dateien
 *   7. `next dev -p 3100` selbst spawnen + auf Erreichbarkeit pollen
 *
 * HINWEIS zu Schritt 7 — Abweichung vom ursprünglichen Plan (Playwright
 * `config.webServer`): Playwright 1.61's TaskRunner startet den
 * `webServer`-Plugin-Task VOR den registrierten `globalSetup`-Dateien
 * (siehe `createGlobalSetupTasks()` in node_modules/playwright/lib/runner/
 * index.js — Reihenfolge: RemoveOutputDirs → PluginSetupTasks (webServer!) →
 * globalTeardowns → globalSetups). Mit `config.webServer` hätte `next dev`
 * also gegen die noch nicht existierende Postgres-Instanz gebootet (Payload-
 * Init crasht mit ECONNREFUSED, bevor dieses Skript überhaupt lief) — live
 * verifiziert, nicht nur vermutet. Deshalb wird der Dev-Server HIER manuell
 * gestartet (nach der DB-Bereitschaft), nicht über `config.webServer`.
 *
 * Wirft hart bei jedem Fehler — eine kaputte Umgebung darf den Testlauf NICHT
 * grün durchlaufen lassen.
 */
import { execFileSync, execSync, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  E2E_BASE_URL,
  E2E_BOOT_ENV,
  E2E_DEV_SERVER_PIDFILE,
  E2E_DEV_SERVER_PORT,
  E2E_PG_CONTAINER,
  E2E_PG_PORT,
} from "./env";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const LOG = "[e2e/global-setup]";

function log(msg: string) {
  console.log(`${LOG} ${msg}`);
}

function runInherit(cmd: string, opts: { env?: Record<string, string> } = {}): void {
  log(`$ ${cmd}`);
  execSync(cmd, {
    cwd: REPO_ROOT,
    stdio: "inherit",
    env: { ...process.env, ...opts.env },
  });
}

const AUTH_SCHEMA_BOOTSTRAP = `
create schema if not exists payload;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;
`;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dockerRmForce(): void {
  log(`Removing any stale container ${E2E_PG_CONTAINER} (errors ignored) …`);
  try {
    execSync(`docker rm -f ${E2E_PG_CONTAINER}`, {
      cwd: REPO_ROOT,
      stdio: "pipe",
    });
  } catch {
    // ignore — container may not exist
  }
}

function dockerRunPostgres(): void {
  log(`Starting fresh Postgres container ${E2E_PG_CONTAINER} on port ${E2E_PG_PORT} …`);
  runInherit(
    `docker run -d --name ${E2E_PG_CONTAINER} -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=fiknow -p ${E2E_PG_PORT}:5432 postgres:16`,
  );
}

async function waitForPgReady(): Promise<void> {
  log("Waiting for Postgres to accept connections (pg_isready) …");
  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      execFileSync(
        "docker",
        ["exec", E2E_PG_CONTAINER, "pg_isready", "-U", "postgres"],
        { stdio: "pipe" },
      );
      // pg_isready can report ready a beat before the server is truly
      // settled for external TCP connections (observed live: drizzle-kit
      // migrate occasionally hit a transient connection failure right after
      // this check passed) — a short settle delay avoids that race.
      await sleep(1500);
      log("Postgres is ready.");
      return;
    } catch {
      if (Date.now() > deadline) {
        throw new Error(
          `${LOG} Postgres did not become ready within 30s (docker exec ${E2E_PG_CONTAINER} pg_isready).`,
        );
      }
      await sleep(1000);
    }
  }
}

function bootstrapSchemas(): void {
  log("Applying auth/payload schema bootstrap SQL …");
  execFileSync(
    "docker",
    ["exec", "-i", E2E_PG_CONTAINER, "psql", "-U", "postgres", "-d", "fiknow"],
    { input: AUTH_SCHEMA_BOOTSTRAP, stdio: ["pipe", "inherit", "inherit"] },
  );
}

function profilesTableExists(): boolean {
  const out = execFileSync(
    "docker",
    [
      "exec",
      E2E_PG_CONTAINER,
      "psql",
      "-U",
      "postgres",
      "-d",
      "fiknow",
      "-tAc",
      "select to_regclass('public.profiles')",
    ],
    { encoding: "utf-8" },
  ).trim();
  return out.length > 0 && out !== "";
}

function drizzleMigrate(): void {
  // Known flakiness (verified live): against a brand-new container,
  // `drizzle-kit migrate` can either (a) silently apply nothing on the first
  // try, or (b) outright fail with a transient connection error while
  // Postgres is still settling right after pg_isready first reports ready.
  // Both are handled the same way: retry up to 3 attempts total, tolerating
  // command failures, and only fail hard if `profiles` truly never appears.
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    log(`Running \`npx drizzle-kit migrate\` (attempt ${attempt}/${MAX_ATTEMPTS}) …`);
    try {
      runInherit("npx drizzle-kit migrate", { env: E2E_BOOT_ENV });
    } catch (err) {
      log(`drizzle-kit migrate attempt ${attempt} failed: ${(err as Error).message}`);
    }
    if (profilesTableExists()) {
      log("Confirmed: public.profiles exists.");
      return;
    }
    log(`\`profiles\` table still missing after attempt ${attempt}.`);
  }
  throw new Error(
    `${LOG} FATAL: public.profiles still does not exist after ${MAX_ATTEMPTS} drizzle-kit migrate attempts.`,
  );
}

function payloadMigrate(): void {
  log("Running `npx payload migrate` …");
  runInherit("npx payload migrate", { env: E2E_BOOT_ENV });
}

function seed(): void {
  log("Running `npx tsx e2e/seed.ts` …");
  runInherit("npx tsx e2e/seed.ts", { env: E2E_BOOT_ENV });
}

function startDevServer(): void {
  log(`Spawning \`next dev -p ${E2E_DEV_SERVER_PORT}\` …`);
  const child = spawn("npx", ["next", "dev", "-p", String(E2E_DEV_SERVER_PORT)], {
    cwd: REPO_ROOT,
    env: { ...process.env, ...E2E_BOOT_ENV },
    detached: true,
    stdio: "inherit",
  });
  if (!child.pid) {
    throw new Error(`${LOG} Failed to spawn next dev server (no pid returned).`);
  }
  mkdirSync(path.dirname(path.resolve(REPO_ROOT, E2E_DEV_SERVER_PIDFILE)), {
    recursive: true,
  });
  writeFileSync(path.resolve(REPO_ROOT, E2E_DEV_SERVER_PIDFILE), String(child.pid));
  child.unref();
  log(`Dev server spawned (pid ${child.pid}), pidfile written.`);
}

async function waitForDevServerReady(): Promise<void> {
  log(`Waiting for ${E2E_BASE_URL} to respond …`);
  const deadline = Date.now() + 170_000;
  let lastErr: unknown;
  for (;;) {
    try {
      const res = await fetch(E2E_BASE_URL, {
        signal: AbortSignal.timeout(5000),
      });
      log(`Dev server responded with HTTP ${res.status} — ready.`);
      return;
    } catch (err) {
      lastErr = err;
      if (Date.now() > deadline) {
        throw new Error(
          `${LOG} Dev server never became reachable at ${E2E_BASE_URL} within 170s: ${
            (lastErr as Error)?.message ?? lastErr
          }`,
        );
      }
      await sleep(1500);
    }
  }
}

export default async function globalSetup(): Promise<void> {
  log("=== Starting E2E environment bootstrap ===");
  try {
    dockerRmForce();
    dockerRunPostgres();
    await waitForPgReady();
    bootstrapSchemas();
    drizzleMigrate();
    payloadMigrate();
    seed();
    startDevServer();
    await waitForDevServerReady();
  } catch (err) {
    log("Bootstrap failed — cleaning up Postgres container before rethrowing …");
    dockerRmForce();
    throw err;
  }
  log("=== E2E environment bootstrap complete ===");
}

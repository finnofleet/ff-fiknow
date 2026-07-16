/**
 * Auto-Migrate beim App-Start.
 *
 * Wird von Next.js' `instrumentation.ts` einmal pro Server-Boot
 * aufgerufen. Bringt die DB in den State, den der aktuelle Code
 * erwartet — kein manuelles `npm run db:bootstrap` mehr nötig.
 *
 * Sequenz:
 *   1. Advisory-Lock holen (Postgres-Lock-ID 7392108564)
 *      → bei Multi-Instance läuft nur einer; andere warten oder skippen
 *   2. Schema `payload` sicherstellen
 *   3. Drizzle-Migrationen (drizzle/-Ordner)
 *   4. Payload-Migrationen (migrations/-Ordner)
 *   5. Lock freigeben
 *
 * Skip-Bedingungen:
 *   - process.env.SKIP_MIGRATIONS === "true" (für CI/Tests)
 *   - process.env.DATABASE_URL fehlt (Build-Time-Fall — kein Crash)
 *
 * Failure-Verhalten:
 *   - Wenn irgendein Schritt fehlschlägt: Exception wird hochgeworfen
 *   - Next.js verweigert den Server-Start, Container crasht
 *   - = "broken-build-not-broken-prod"-Pattern
 */
import { readdirSync } from "node:fs";
import path from "node:path";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate as drizzleMigrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { sslConfigFromUrl } from "./ssl-config";

// Fester Lock-Key. Bewusst im int32-Bereich (< 2^31) gehalten, sodass
// die int4-Variante von pg_advisory_lock greift — kein bigint-Boilerplate
// nötig.
const ADVISORY_LOCK_KEY = 1392108564;
const LOG_PREFIX = "[auto-migrate]";

let migrationsRan = false;

// Minimaler, GoTrue-freier Teil von scripts/setup-auth.sql: nur auth-Schema +
// die uid/role-Helper, die die RLS-Policies referenzieren. Muss VOR den
// Drizzle-Migrationen laufen (Policies brauchen auth.uid()). Idempotent.
// Canonical-Definition: scripts/setup-auth.sql — bei Änderungen dort
// mitziehen.
const AUTH_SCHEMA_BOOTSTRAP = `
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

/**
 * Legt auth-Schema + uid/role-Helper an. Auf Supabase fehlen dem postgres-User
 * ggf. die Rechte am auth-Schema (42501) — dort stellt Supabase die Helfer
 * selbst bereit, also tolerieren wir das und gehen weiter.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function applyAuthSchemaBootstrap(sql: any): Promise<void> {
  try {
    await sql.unsafe(AUTH_SCHEMA_BOOTSTRAP);
  } catch (err) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((err as any)?.code === "42501") {
      console.warn(
        `${LOG_PREFIX} auth-Schema-Bootstrap: permission denied (vermutlich Supabase) — übersprungen`,
      );
    } else {
      throw err;
    }
  }
}

export async function runAutoMigrations(): Promise<void> {
  if (migrationsRan) return; // Idempotenz auf Modul-Ebene

  if (process.env.SKIP_MIGRATIONS === "true") {
    console.log(`${LOG_PREFIX} SKIP_MIGRATIONS=true — übersprungen.`);
    migrationsRan = true;
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log(`${LOG_PREFIX} DATABASE_URL fehlt — übersprungen (Build-Zeit?).`);
    return;
  }

  const startedAt = Date.now();
  const sql = postgres(databaseUrl, {
    max: 1,
    ssl: sslConfigFromUrl(databaseUrl),
  });

  try {
    // --- 1. Advisory-Lock ---------------------------------------------
    const [{ acquired }] = await sql<{ acquired: boolean }[]>`
      SELECT pg_try_advisory_lock(${ADVISORY_LOCK_KEY}) AS acquired
    `;
    if (!acquired) {
      console.log(
        `${LOG_PREFIX} Andere Instance migriert gerade — warte auf Lock …`,
      );
      // Blockt bis Lock frei ist. Maximal so lange wie die andere Instance
      // braucht (typisch <30s).
      await sql`SELECT pg_advisory_lock(${ADVISORY_LOCK_KEY})`;
    }

    try {
      // --- 2. payload-Schema ------------------------------------------
      await sql`CREATE SCHEMA IF NOT EXISTS payload`;

      // --- 2b. auth-Schema + uid/role-Helper (VOR den Drizzle-Policies) ---
      // Die RLS-Policies in drizzle/ referenzieren auth.uid(). Auf Supabase
      // stellt GoTrue das auth-Schema bereit; auf plain Postgres
      // (AUTH_PROVIDER=oidc) muss es VOR den Policies existieren, sonst bricht
      // CREATE POLICY mit „schema auth does not exist". Der Trigger-Teil aus
      // setup-auth.sql bleibt NACH den Migrationen (er braucht public.profiles).
      await applyAuthSchemaBootstrap(sql);

      // --- 3. Drizzle migrations -------------------------------------
      const drizzleDb = drizzle(sql);
      await drizzleMigrate(drizzleDb, {
        migrationsFolder: path.join(process.cwd(), "drizzle"),
      });

      // (Die auth.uid()/role()-Helfer für RLS legt Schritt 2b an; ein
      // separates setup-auth.sql gibt es bei FIKNOW nicht — kein GoTrue.)

      // --- 4. Payload-Migrationen -------------------------------------
      //
      // BOOT-SPEED (502-Fix): `npx payload migrate` bootet eine VOLLE zweite
      // Payload-Instanz (npx-Resolution + Config-Load + Remote-DB-Drift-Check)
      // — bei jedem Restart 2-3 Min, auch wenn nichts zu migrieren ist. Das
      // verursachte das post-Deploy-502. Darum hier ein billiger Pending-Check
      // (ein SELECT gegen payload.payload_migrations): sind alle erwarteten
      // Migrationen angewandt, überspringen wir den Subprozess komplett. Er
      // läuft nur noch, wenn wirklich eine neue Migration mitkommt.
      if (await payloadMigrationsPending(sql)) {
        // Via CLI als Subprocess. Payload zeigt einen Drift-Warning-Prompt
        // ("Run Payload in dev mode … data loss will occur. Proceed?") wenn
        // er glaubt dass die DB via push (statt migrate) gepatcht wurde.
        // Wir akzeptieren das bewusst, indem wir "y\n" auf stdin schicken:
        // unsere Migrations sind IF-NOT-EXISTS-idempotent (siehe drizzle/),
        // also kein realer Data-Loss-Risk.
        //
        // --force-accept-warning Flag wird vom v3-Migrate-Subcommand
        // anscheinend ignoriert, deshalb explicit stdin-Pipe.
        console.log(`${LOG_PREFIX} Payload-Migration ausstehend — starte CLI …`);
        const { spawnSync } = await import("node:child_process");
        const cliResult = spawnSync("npx", ["payload", "migrate"], {
          input: "y\n",
          stdio: ["pipe", "inherit", "inherit"],
          env: { ...process.env },
        });
        if (cliResult.status !== 0) {
          throw new Error(
            `payload migrate exit ${cliResult.status ?? "(killed)"}` +
              (cliResult.error ? `: ${cliResult.error.message}` : ""),
          );
        }
      } else {
        console.log(
          `${LOG_PREFIX} Payload-Migrationen aktuell — CLI-Subprozess übersprungen.`,
        );
      }
    } finally {
      await sql`SELECT pg_advisory_unlock(${ADVISORY_LOCK_KEY})`;
    }

    const elapsedMs = Date.now() - startedAt;
    console.log(`${LOG_PREFIX} fertig in ${elapsedMs} ms`);
    migrationsRan = true;
  } finally {
    await sql.end();
  }
}

/**
 * Billiger Check, ob ein `payload migrate`-Lauf nötig ist — ohne Payload zu
 * booten. Vergleicht die Migration-Dateien im `migrations/`-Ordner mit den in
 * `payload.payload_migrations` bereits eingetragenen Namen.
 *
 * Konvention (von Payloads Migrations-Generator): der Migration-`name` ist
 * exakt der Dateiname ohne Endung (z. B. `20260611_231500_add_course_tutor_enabled`)
 * — siehe migrations/index.ts.
 *
 * Richtung der Sicherheit: nur `false` (= skippen) zurückgeben, wenn JEDE
 * erwartete Migration in der Tabelle steht. Jeder Unsicherheitsfall (Ordner
 * unlesbar, Tabelle fehlt, Query-Fehler) → `true`, damit die CLI im Zweifel
 * läuft. Ein unnötiger Lauf ist nur langsam; ein fälschlich übersprungener
 * wäre ein kaputtes Schema.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function payloadMigrationsPending(sql: any): Promise<boolean> {
  // Erwartete Migrationen: Dateinamen im migrations/-Ordner (.ts oder .js,
  // ohne index.* und ohne die .json-Snapshots).
  let expected: string[];
  try {
    const dir = path.join(process.cwd(), "migrations");
    const seen = new Set<string>();
    for (const file of readdirSync(dir)) {
      const m = /^(\d{8}_\d{6}_.+)\.(ts|js)$/.exec(file);
      if (m) seen.add(m[1]);
    }
    expected = [...seen];
  } catch {
    return true; // Ordner nicht lesbar → sicherheitshalber migrieren
  }
  if (expected.length === 0) return true; // nichts gefunden → CLI entscheiden lassen

  // Angewandte Migrationen aus der Tracking-Tabelle (Schema `payload`).
  let applied: Set<string>;
  try {
    const rows = await sql<{ name: string }[]>`
      SELECT name FROM payload.payload_migrations
    `;
    applied = new Set(rows.map((r: { name: string }) => r.name));
  } catch {
    return true; // Tabelle existiert noch nicht / Query-Fehler → migrieren
  }

  return expected.some((name) => !applied.has(name));
}

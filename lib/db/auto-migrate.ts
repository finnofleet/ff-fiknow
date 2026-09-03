/**
 * DB-Bootstrap beim App-Start.
 *
 * Wird von Next.js' `instrumentation.ts` einmal pro Server-Boot aufgerufen.
 * Bringt die DB in den State, den der aktuelle Code erwartet — kein manuelles
 * `npm run db:bootstrap` mehr nötig.
 *
 * **Zwei getrennte Anliegen, zwei getrennte Schalter.** Migrationen ändern das
 * SCHEMA; Initializer stellen INHALTE her, die der Code als vorhanden
 * voraussetzt (die Rollen-Matrix — also die Grundlage JEDER Berechtigung).
 * Das sind verschiedene Risiken, und sie hingen früher an einem Flag: wer
 * `SKIP_MIGRATIONS` als Notausstieg zog („fass mein Schema nicht an"), schaltete
 * damit unbeabsichtigt auch die Inhalts-Initialisierung ab. Deshalb jetzt:
 *
 *   SKIP_MIGRATIONS=true  → nur die Migrationen aus (Schema unberührt)
 *   SKIP_DB_INIT=true     → nur die Initializer aus
 *
 * Beide unabhängig. Der Regelfall für einen Notausstieg ist `SKIP_MIGRATIONS`
 * allein — auf einem bestehenden System ist das Schema ja da, und die
 * Initializer sollen weiterlaufen. `SKIP_DB_INIT` ist der zweite Notausstieg
 * für den Fall, dass die Initializer selbst klemmen (z. B. weil das Schema
 * wirklich unvollständig ist).
 *
 * Sequenz:
 *   1. Advisory-Lock holen (Postgres-Lock-ID 1392108564)
 *      → bei Multi-Instance läuft nur einer; andere warten
 *   2. Schema `payload` sicherstellen         ⟍
 *   2b. auth-Schema + uid/role-Helper          ⟩ nur ohne SKIP_MIGRATIONS
 *   3. Drizzle-Migrationen (drizzle/)          |
 *   4. Payload-Migrationen (migrations/)      ⟋
 *   5. DB-Initializer (lib/db/initializers)   — nur ohne SKIP_DB_INIT
 *   6. Lock freigeben
 *
 * Weitere Skip-Bedingung (beide Schritte):
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

import * as schema from "./schema";
import { sslConfigFromUrl } from "./ssl-config";

// Fester Lock-Key. Bewusst im int32-Bereich (< 2^31) gehalten, sodass
// die int4-Variante von pg_advisory_lock greift — kein bigint-Boilerplate
// nötig.
const ADVISORY_LOCK_KEY = 1392108564;
const LOG_PREFIX = "[db-bootstrap]";

let bootstrapRan = false;

// Kanonische Definition von auth-Schema + uid/role-Helper, die die
// RLS-Policies referenzieren (kein separates setup-auth.sql — dieser
// Inline-String IST die Quelle). Muss VOR den Drizzle-Migrationen laufen
// (Policies brauchen auth.uid()). Idempotent.
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
 * Legt auth-Schema + uid/role-Helper an. Auf Managed-Postgres, wo der
 * App-User keine Rechte am auth-Schema hat (42501), tolerieren wir das und
 * gehen weiter.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function applyAuthSchemaBootstrap(sql: any): Promise<void> {
  try {
    await sql.unsafe(AUTH_SCHEMA_BOOTSTRAP);
  } catch (err) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((err as any)?.code === "42501") {
      console.warn(
        `${LOG_PREFIX} auth-Schema-Bootstrap: permission denied (vermutlich Managed-Postgres ohne Rechte am auth-Schema) — übersprungen`,
      );
    } else {
      throw err;
    }
  }
}

/**
 * Die Schema-Schritte (payload-Schema, auth-Helper, Drizzle, Payload). Als
 * eigene Funktion, damit der Einstiegspunkt die zwei Anliegen —
 * Schema vs. Inhalte — flach nebeneinander zeigt statt verschachtelt.
 */
async function runSchemaMigrations(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sql: any,
  drizzleDb: ReturnType<typeof drizzle<typeof schema>>,
): Promise<void> {
      // --- 2. payload-Schema ------------------------------------------
      await sql`CREATE SCHEMA IF NOT EXISTS payload`;

      // --- 2b. auth-Schema + uid/role-Helper (VOR den Drizzle-Policies) ---
      // Die RLS-Policies in drizzle/ referenzieren auth.uid(). Es muss VOR
      // den Policies existieren, sonst bricht CREATE POLICY mit „schema auth
      // does not exist".
      await applyAuthSchemaBootstrap(sql);

      // --- 3. Drizzle migrations -------------------------------------
      await drizzleMigrate(drizzleDb, {
        migrationsFolder: path.join(process.cwd(), "drizzle"),
      });

      // (Die auth.uid()/role()-Helfer für RLS legt Schritt 2b an; ein
      // separates setup-auth.sql gibt es bei FINKNOW nicht — kein GoTrue.)

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
}

export async function runDbBootstrap(): Promise<void> {
  if (bootstrapRan) return; // Idempotenz auf Modul-Ebene

  const skipMigrations = process.env.SKIP_MIGRATIONS === "true";
  const skipInit = process.env.SKIP_DB_INIT === "true";
  if (skipMigrations && skipInit) {
    console.log(
      `${LOG_PREFIX} SKIP_MIGRATIONS=true + SKIP_DB_INIT=true — komplett übersprungen.`,
    );
    bootstrapRan = true;
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
      // Der Drizzle-Client wird von BEIDEN Schritten gebraucht (Migrationen
      // + Initializer), deshalb ausserhalb der Migrations-Verzweigung.
      const drizzleDb = drizzle(sql, { schema });

      if (skipMigrations) {
        console.log(
          `${LOG_PREFIX} SKIP_MIGRATIONS=true — Schema-Migrationen übersprungen.`,
        );
      } else {
        await runSchemaMigrations(sql, drizzleDb);
      }

      // --- 5. DB-Initializer ------------------------------------------
      // Inhalte statt Schema — und bewusst UNABHÄNGIG von SKIP_MIGRATIONS
      // (siehe Datei-Kopf): auf einem bestehenden System ist das Schema da,
      // die Rollen-Matrix soll trotzdem abgeglichen werden. Läuft noch
      // INNERHALB des Advisory-Locks, damit bei mehreren Replicas genau eine
      // Instanz abgleicht. Wirft bei Fehlern → Boot bricht ab (siehe
      // lib/db/initializers).
      if (skipInit) {
        console.log(`${LOG_PREFIX} SKIP_DB_INIT=true — Initializer übersprungen.`);
      } else {
        const { runInitializers } = await import("./initializers");
        await runInitializers(drizzleDb);
      }
    } finally {
      await sql`SELECT pg_advisory_unlock(${ADVISORY_LOCK_KEY})`;
    }

    const elapsedMs = Date.now() - startedAt;
    console.log(`${LOG_PREFIX} fertig in ${elapsedMs} ms`);
    bootstrapRan = true;
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

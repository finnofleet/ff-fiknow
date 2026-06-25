/**
 * Frischen DB-Stack initialisieren oder einen bestehenden auf den
 * neuesten Stand bringen. Führt alle nötigen Setup-Schritte in der
 * richtigen Reihenfolge aus, gegen die in DATABASE_URL angegebene DB.
 *
 * Schritte:
 *   1. Connection-Test
 *   2. Schema `payload` anlegen (idempotent)
 *   3. Drizzle: App-Tabellen + RLS-Policies (public.*)
 *   4. setup-auth.sql: auth.uid()-Function + on_auth_user_created-Trigger
 *   5. Payload-Migrationen (legt payload.courses/sections/lessons etc. an)
 *
 * Usage:
 *   DATABASE_URL='postgres://user:pw@host:port/db' \
 *     node scripts/bootstrap-db.mjs
 *
 * Optional Flags:
 *   --skip-drizzle   nur SQL + Payload
 *   --skip-payload   nur Drizzle + SQL
 *   --skip-auth      auth.uid() + Trigger überspringen
 *
 * Funktioniert gegen lokale DBs und Remote (via SSH-Tunnel auf
 * 127.0.0.1:<tunnel-port>).
 */
import { execSync } from "node:child_process";
import postgres from "postgres";

const args = new Set(process.argv.slice(2));
const skipDrizzle = args.has("--skip-drizzle");
const skipAuth = args.has("--skip-auth");
const skipPayload = args.has("--skip-payload");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL ist nicht gesetzt.");
  console.error("");
  console.error("Beispiel:");
  console.error("  DATABASE_URL='postgres://postgres:pw@127.0.0.1:54322/db' \\");
  console.error("    node scripts/bootstrap-db.mjs");
  process.exit(1);
}

// SSL-Detection wie in lib/db/ssl-config.ts (inline weil .mjs).
function sslConfigFromUrl(url) {
  const m = url.match(/[?&]sslmode=([^&]+)/);
  if (!m) return false;
  const mode = m[1].toLowerCase();
  if (mode === "disable") return false;
  if (mode === "verify-full" || mode === "verify-ca") return true;
  return { rejectUnauthorized: false };
}

// Hilfsfunktion: Maskierte URL für Logs
function maskedUrl(url) {
  return url.replace(/(postgres(?:ql)?:\/\/[^:]+:)[^@]+(@)/, "$1***$2");
}

// Hilfsfunktion: Sub-Command mit forciertem Env (keine .env-Datei dazwischen)
function runStep(label, command) {
  console.log(`\n=== ${label} ===`);
  console.log(`$ ${command}`);
  try {
    execSync(command, {
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
      },
    });
    console.log(`✓ ${label}`);
  } catch (err) {
    console.error(`✗ ${label} fehlgeschlagen (exit ${err.status})`);
    process.exit(err.status ?? 1);
  }
}

// ============================================================
// 1. Connection-Test
// ============================================================

console.log(`\n=== 1. Connection-Test ===`);
console.log(`Target: ${maskedUrl(databaseUrl)}`);

const sql = postgres(databaseUrl, {
  max: 1,
  ssl: sslConfigFromUrl(databaseUrl),
});

try {
  const r = await sql`SELECT current_database() as db, current_user as usr, version()`;
  console.log(`✓ Connected — db=${r[0].db}, user=${r[0].usr}`);
  console.log(`  ${r[0].version.split(",")[0]}`);
} catch (err) {
  console.error(`✗ Connection fehlgeschlagen: ${err.message}`);
  console.error(`  Tipp: SSH-Tunnel offen? Host/Port/PW korrekt?`);
  process.exit(1);
}

// ============================================================
// 2. Schema "payload" anlegen
// ============================================================

console.log(`\n=== 2. Schema "payload" sicherstellen ===`);
try {
  await sql`CREATE SCHEMA IF NOT EXISTS payload`;
  console.log("✓ Schema payload existiert");
} catch (err) {
  console.error(`✗ Schema-Create fehlgeschlagen: ${err.message}`);
  process.exit(1);
}

await sql.end();

// ============================================================
// 3. Drizzle: public.*-Tabellen + RLS
// ============================================================

if (!skipDrizzle) {
  // `--force` würde drizzle-kit non-interactive machen, aber wir wollen
  // dass der User bei destructive Diffs noch bestätigt. Stdio inherit
  // gibt ihm den Prompt.
  runStep("3. Drizzle push (public.* Tabellen + RLS)", "npx drizzle-kit push");
} else {
  console.log("\n--- Drizzle übersprungen (--skip-drizzle)");
}

// ============================================================
// 4. setup-auth.sql
// ============================================================

if (!skipAuth) {
  runStep(
    "4. Auth-Setup (auth.uid() + on_auth_user_created Trigger)",
    "npx tsx scripts/apply-sql.ts scripts/setup-auth.sql",
  );
} else {
  console.log("\n--- Auth-Setup übersprungen (--skip-auth)");
}

// ============================================================
// 5. Payload-Migrationen
// ============================================================

if (!skipPayload) {
  runStep(
    "5. Payload-Migrationen (payload.* Tabellen)",
    "npx payload migrate",
  );
} else {
  console.log("\n--- Payload-Migrationen übersprungen (--skip-payload)");
}

console.log(`\n\n✓ Bootstrap abgeschlossen für ${maskedUrl(databaseUrl)}`);

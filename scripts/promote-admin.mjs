/**
 * Promotet einen User zur Admin-Rolle anhand der Email-Adresse.
 *
 * Plain Node-ESM (kein tsx), damit auch im Production-Container ohne
 * Dev-Dependencies lauffähig — speziell für Web-SSH auf Jelastic.
 *
 * Bootstrap-Tool für frische Deployments: bei einer neuen Brand-Instanz
 * gibt es initial niemanden mit Admin-Rolle (Default ist `learner`).
 * Einmal pro Environment ausführen.
 *
 * Idempotent: mehrfach aufrufen ist harmlos.
 *
 * Usage (lokal):
 *   npm run admin:bootstrap -- user@example.com
 *
 * Usage (im Prod-Container via Web-SSH):
 *   cd /app
 *   node scripts/promote-admin.mjs user@example.com
 *
 * Usage (gegen Remote-DB via SSH-Tunnel):
 *   DATABASE_URL=postgres://... node scripts/promote-admin.mjs user@example.com
 *
 * Voraussetzungen:
 *   - User mit dieser Email muss bereits registriert sein
 *   - DATABASE_URL muss gesetzt sein (im Container schon der Fall)
 *   - `postgres` npm-Lib ist verfügbar (production-dep, immer da)
 */
import postgres from "postgres";

// SSL-Config-Detection inline (kein Import auf .ts-Helper, weil das Script
// auch ohne TypeScript-Toolchain laufen können muss).
function sslConfigFromUrl(url) {
  const m = url.match(/[?&]sslmode=([^&]+)/);
  if (!m) return false;
  const mode = m[1].toLowerCase();
  if (mode === "disable") return false;
  if (mode === "verify-full" || mode === "verify-ca") return true;
  return { rejectUnauthorized: false };
}

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!email || !email.includes("@")) {
  console.error("Usage: node scripts/promote-admin.mjs <email>");
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL ist nicht gesetzt.");
  process.exit(1);
}

const sql = postgres(databaseUrl, {
  max: 1,
  ssl: sslConfigFromUrl(databaseUrl),
});

try {
  const users = await sql`
    SELECT id FROM auth.users WHERE lower(email) = ${email} LIMIT 1
  `;
  if (users.length === 0) {
    console.error(`Kein Konto mit Email "${email}" gefunden.`);
    console.error(`Person muss sich erst über die Plattform registrieren.`);
    process.exit(1);
  }
  const userId = users[0].id;

  await sql`
    INSERT INTO public.profiles (user_id, role)
    VALUES (${userId}::uuid, 'admin')
    ON CONFLICT (user_id) DO UPDATE SET role = 'admin'
  `;

  const after = await sql`
    SELECT role FROM public.profiles WHERE user_id = ${userId}::uuid
  `;

  console.log(`✓ ${email} (user_id=${userId}) hat jetzt Rolle: ${after[0].role}`);
} finally {
  await sql.end();
}

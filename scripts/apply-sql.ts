/**
 * Führt eine SQL-Datei gegen DATABASE_URL aus.
 * Verwendet für RLS-Setup, Seed-Skripte etc.
 *
 * Usage: tsx scripts/apply-sql.ts <pfad/zur/datei.sql>
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import postgres from "postgres";

async function main() {
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error("Bitte SQL-Pfad angeben.");
    process.exit(1);
  }
  const sqlPath = path.resolve(fileArg);
  const sql = await fs.readFile(sqlPath, "utf8");

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL nicht gesetzt.");
    process.exit(1);
  }

  const client = postgres(connectionString, { max: 1 });
  // SECURITY_AUDIT Finding 10 — nur den DB-Namen loggen, nicht Host:Port
  // (kein Credential-Leak, aber Host gehört nicht ins CI/CD-Log).
  const dbLabel = (() => {
    try {
      return new URL(connectionString).pathname.replace(/^\//, "") || "?";
    } catch {
      return "?";
    }
  })();
  console.log(`→ Wende ${path.basename(sqlPath)} an gegen DB "${dbLabel}"`);

  try {
    await client.unsafe(sql);
    console.log("✓ Erfolgreich angewendet");
  } catch (err) {
    console.error("✗ Fehler:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();

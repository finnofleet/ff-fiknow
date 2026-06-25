/**
 * Setzt das `payload`-Schema komplett zurück.
 *
 * Wird benutzt, wenn Payload via dev-mode push Tabellen erstellt hat,
 * die mit einer späteren expliziten Migration kollidieren.
 *
 * ⚠️  ZERSTÖRT alle Daten im payload-Schema. Drizzle-Tabellen im
 *    public-Schema bleiben unangetastet.
 *
 * Usage:
 *   dotenv -e .env.local -- tsx scripts/drop-payload-schema.ts
 */
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

await sql`drop schema if exists payload cascade`;
await sql`create schema payload`;

console.log("✓ Schema 'payload' wurde geleert.");

await sql.end();

/**
 * Listet alle Tabellen im Schema `payload`, damit wir nach dem ersten
 * Dev-Server-Start verifizieren können, dass Payload seine Migrationen
 * erfolgreich gefahren hat.
 *
 * Usage:
 *   dotenv -e .env.local -- tsx scripts/check-payload-schema.ts
 */
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

const rows = await sql<
  { table_name: string }[]
>`select table_name from information_schema.tables
   where table_schema = 'payload'
   order by table_name;`;

console.log(`\nFound ${rows.length} table(s) in schema "payload":\n`);
for (const row of rows) console.log("  -", row.table_name);

await sql.end();

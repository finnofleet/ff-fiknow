/**
 * Quick-Check: Welche Tabellen + RLS-Policies existieren in public/payload?
 */
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

const tables = await sql<{ schemaname: string; tablename: string }[]>`
  select schemaname, tablename
  from pg_tables
  where schemaname in ('public', 'payload')
  order by schemaname, tablename;
`;

console.log("\n=== Tables ===");
for (const t of tables) console.log(`  ${t.schemaname}.${t.tablename}`);

const policies = await sql<{ tablename: string; policyname: string }[]>`
  select tablename, policyname
  from pg_policies
  where schemaname = 'public'
  order by tablename, policyname;
`;

console.log("\n=== RLS-Policies (public) ===");
for (const p of policies)
  console.log(`  ${p.tablename}: ${p.policyname}`);

await sql.end();

/**
 * Listet alle Profiles + GoTrue-Email, damit man weiss welcher User
 * zu welchem Account gehoert. Hilft beim Editor-Promote-Flow.
 */
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

const rows = await sql<
  { user_id: string; email: string; role: string; display_name: string | null }[]
>`
  select p.user_id, u.email, p.role, p.display_name
  from public.profiles p
  join auth.users u on u.id = p.user_id
  order by p.role, u.email;
`;

console.log("\n=== Profiles (sortiert nach role) ===\n");
for (const r of rows) {
  console.log(`  ${r.role.padEnd(8)} ${r.email.padEnd(30)} ${r.user_id}`);
}

await sql.end();

/**
 * Droppt eine Datenbank und legt sie leer neu an. Optional: setzt
 * gleichzeitig das postgres-User-Passwort neu.
 *
 * Erwartet, dass DATABASE_URL auf die System-DB `postgres` zeigt
 * (NICHT auf die Ziel-DB selbst — eine offene Verbindung verhindert das
 * Droppen). Plus: andere Verbindungen zur Ziel-DB werden vorab terminiert.
 *
 * Usage:
 *   DATABASE_URL=postgres://postgres:<PW>@localhost:5432/postgres \
 *     [POSTGRES_NEW_PASSWORD=<neu>] \
 *     tsx scripts/reset-database.mts <target-db-name>
 *
 * Beispiele:
 *   # nur DB resetten
 *   tsx scripts/reset-database.mts verstande
 *
 *   # DB resetten + neues postgres-User-PW setzen
 *   POSTGRES_NEW_PASSWORD=hunter2 tsx scripts/reset-database.mts verstande
 */
import postgres from "postgres";

const target = process.argv[2];
if (!target) {
  console.error("Usage: tsx scripts/reset-database.mts <target-db-name>");
  process.exit(1);
}
if (!/^[a-z_][a-z0-9_]*$/i.test(target)) {
  console.error("Ungültiger DB-Name (nur Buchstaben/Zahlen/Unterstrich).");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

// 1. Andere Verbindungen zur Ziel-DB killen (sonst kann sie nicht gedroppt werden).
const killed = await sql<{ count: bigint }[]>`
  SELECT count(pg_terminate_backend(pid)) AS count
  FROM pg_stat_activity
  WHERE datname = ${target}
    AND pid <> pg_backend_pid();
`;
console.log(`Terminierte offene Verbindungen: ${killed[0].count}`);

// 2. Drop + Create. unsafe(), weil der DB-Name kein Bind-Parameter sein darf.
await sql.unsafe(`DROP DATABASE IF EXISTS "${target}"`);
console.log(`✓ DROP DATABASE ${target} (falls existiert)`);

await sql.unsafe(`CREATE DATABASE "${target}"`);
console.log(`✓ CREATE DATABASE ${target}`);

// 3. Optional: postgres-User-PW ändern
const newPw = process.env.POSTGRES_NEW_PASSWORD;
if (newPw) {
  // Wir können den PW-String nicht als Bind-Parameter durchreichen
  // (ALTER USER erlaubt das nicht), und müssen ihn deshalb escapen.
  // Standard-SQL-Escaping: Single-Quotes werden verdoppelt ('→'').
  const escaped = newPw.replace(/'/g, "''");
  await sql.unsafe(`ALTER USER postgres WITH PASSWORD '${escaped}'`);
  console.log(`✓ postgres-User-PW geändert`);
}

await sql.end();
console.log(`\nDB '${target}' ist frisch und leer.`);
if (newPw) {
  console.log(
    "\n⚠️  PW geändert. Container-Env-Vars (App + GoTrue) in Jelastic " +
      "jetzt updaten, sonst connecten die Container weiter mit dem alten PW.",
  );
}

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";
import { sslConfigFromUrl } from "./ssl-config";

/**
 * Pool-Grösse. Managed-Postgres hat ein hartes `max_connections`-Limit, das
 * sich ALLE Replicas teilen. Deshalb env-konfigurierbar: pro Pod öffnen
 * Drizzle- und Payload-Pool je `DB_POOL_MAX` Verbindungen, total also
 * `2 * DB_POOL_MAX * replicas`. Default 5 (= 10/Pod) ist konservativ.
 */
function poolMax(): number {
  const raw = process.env.DB_POOL_MAX;
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 5;
}

function poolIdleTimeout(): number {
  const raw = process.env.DB_POOL_IDLE_TIMEOUT_SEC;
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 20;
}

/**
 * Lazy-initialisierter Drizzle-Client.
 *
 * Wir vermeiden bewusst, beim Modul-Import schon eine Connection
 * zu öffnen — Next.js evaluiert beim `next build` auch Module, die
 * nur `db` re-exportieren würden, und in CI ist `DATABASE_URL` zur
 * Build-Zeit typischerweise nicht gesetzt.
 *
 * Die Verbindung entsteht erst bei der ersten echten Query (also
 * zur Request-Zeit), wo `DATABASE_URL` aus der Runtime-Env stammt.
 */

type DB = ReturnType<typeof drizzle<typeof schema>>;
type Client = ReturnType<typeof postgres>;

let cached: DB | null = null;
let cachedClient: Client | null = null;

function createDb(): DB {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL ist nicht gesetzt. In Production über Container-Env, lokal über .env.local.",
    );
  }
  const client = postgres(connectionString, {
    prepare: false,
    ssl: sslConfigFromUrl(connectionString),
    // Pool-Limits: postgres-js default ist 10 Connections + nie idle-out.
    // Managed-Postgres teilt sein max_connections-Limit über alle Replicas —
    // deshalb begrenzt + via DB_POOL_MAX konfigurierbar (Default 5).
    max: poolMax(),
    idle_timeout: poolIdleTimeout(),
  });
  cachedClient = client;
  return drizzle(client, { schema });
}

export const db: DB = new Proxy({} as DB, {
  get(_target, prop) {
    if (!cached) cached = createDb();
    return Reflect.get(cached, prop);
  },
});

/**
 * Leichtgewichtiger Connectivity-Check für die Readiness-Probe: erzwingt eine
 * echte Connection aus dem Pool und ein `SELECT 1`. Wirft bei DB-Problemen.
 */
export async function pingDb(): Promise<void> {
  await db.execute(sql`select 1`);
}

/**
 * Schliesst den Drizzle-Pool geordnet (für den SIGTERM-Shutdown). postgres-js
 * `end()` wartet laufende Queries ab und schickt dann Terminate an Postgres,
 * damit die Connection-Slots auf der Managed-DB sofort frei werden — wichtig
 * bei Rolling-Deployments mit begrenztem max_connections.
 */
export async function closeDb(): Promise<void> {
  if (!cachedClient) return;
  const client = cachedClient;
  cachedClient = null;
  cached = null;
  await client.end({ timeout: 5 });
}

export { schema };

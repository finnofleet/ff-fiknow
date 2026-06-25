import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";
import { sslConfigFromUrl } from "./ssl-config";

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

let cached: DB | null = null;

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
    // Mit Payload's eigenem Pool (10) + GoTrue + Supabase-Services kommen
    // wir bei aggressiven Reloads schnell auf >100 = Postgres-Connection-
    // Exhaustion. 5 max + 20s idle-Timeout hält die Last sauber.
    max: 5,
    idle_timeout: 20,
  });
  return drizzle(client, { schema });
}

export const db: DB = new Proxy({} as DB, {
  get(_target, prop) {
    if (!cached) cached = createDb();
    return Reflect.get(cached, prop);
  },
});

export { schema };

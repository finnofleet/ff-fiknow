/**
 * DB-Initializer — laufen bei JEDEM Boot, direkt nach den Migrationen.
 *
 * **Zweck.** Ein frisches System soll ohne manuelle Schritte vollständig
 * hochkommen, und ein bestehendes soll fehlende Bestandteile nachgezogen
 * bekommen. Migrationen ändern das SCHEMA; Initializer stellen INHALTE her,
 * die der Code als vorhanden voraussetzt (heute: die System-Rollen-Matrix).
 *
 * **Vertrag für jeden Initializer:**
 *  - **Idempotent** — mehrfaches Ausführen ändert nichts.
 *  - **Abgleichend, wo der Code der Eigentümer ist** — nicht nur ergänzend.
 *    Sonst lässt sich eine Entziehung (z. B. eine weggenommene Capability)
 *    nicht übertragen; siehe die Begründung in `system-roles.ts`.
 *  - **Wirft bei Fehlern.** Der Aufrufer (`auto-migrate.ts`) lässt den Boot
 *    scheitern — dasselbe „broken-build-not-broken-prod"-Muster wie bei den
 *    Migrationen. Mit halb hergestelltem Rechte-Bestand zu starten wäre
 *    schlimmer als nicht zu starten: nach dem Wegfall des Code-Bodens
 *    hinge JEDE Berechtigung an dieser Matrix.
 *
 * **Nebenläufigkeit** ist nicht Sache der Initializer: `runDbBootstrap`
 * hält das Postgres-Advisory-Lock, während dieser Lauf passiert — bei
 * mehreren Replicas führt genau eine Instanz aus, die anderen warten.
 *
 * Neue Initializer werden unten in `INITIALIZERS` eingetragen. Die Liste ist
 * geordnet; Reihenfolge = Ausführungsreihenfolge.
 */
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import type * as schema from "../schema";

import { backfillRoleKeys } from "./backfill-role-keys";
import { normalizeLegacyRoles } from "./normalize-legacy-roles";
import { syncSystemRoles } from "./system-roles";

/**
 * Drizzle-Client, wie ihn sowohl der Boot-Pfad (`auto-migrate.ts`, auf der
 * Migrations-Verbindung) als auch die CLI-Hüllen (`lib/db/client`) liefern —
 * beide schema-gebunden, damit Initializer aus beiden Kontexten laufen.
 */
export type InitializerDb = PostgresJsDatabase<typeof schema>;

const LOG_PREFIX = "[db-init]";

export type Initializer = {
  /** Kurzname für das Log. */
  name: string;
  /** Führt den Abgleich aus und gibt eine einzeilige Zusammenfassung zurück. */
  run: (db: InitializerDb) => Promise<string>;
};

export const INITIALIZERS: Initializer[] = [
  { name: "system-roles", run: syncSystemRoles },
  // VOR dem Backfill: der leitet die Rollen-Menge aus `profiles.role` ab —
  // ein verbliebenes `editor` wuerde dort sonst als Lerner-Menge einfrieren.
  { name: "normalize-legacy-roles", run: normalizeLegacyRoles },
  // NACH system-roles: die Keys, die hier gesetzt werden, sind nur etwas
  // wert, wenn die Matrix-Zeilen dazu existieren.
  { name: "backfill-role-keys", run: backfillRoleKeys },
];

/**
 * Führt alle Initializer der Reihe nach aus. Läuft auf der
 * Migrations-Verbindung (innerhalb des Advisory-Locks), damit kein zweiter
 * Pool nur für den Boot geöffnet wird.
 */
export async function runInitializers(db: InitializerDb): Promise<void> {
  for (const initializer of INITIALIZERS) {
    try {
      const summary = await initializer.run(db);
      console.log(`${LOG_PREFIX} ${initializer.name}: ${summary}`);
    } catch (err) {
      // Kontext anreichern und weiterwerfen — welcher Initializer gescheitert
      // ist, ist die erste Frage bei einem fehlgeschlagenen Boot.
      throw new Error(
        `Initializer "${initializer.name}" fehlgeschlagen: ` +
          (err instanceof Error ? err.message : String(err)),
        { cause: err },
      );
    }
  }
}

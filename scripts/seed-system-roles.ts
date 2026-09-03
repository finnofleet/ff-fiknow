/**
 * CLI-Hülle um den `system-roles`-Initializer (ADR 0007 §2).
 *
 * Die Logik selbst liegt in `lib/db/initializers/system-roles.ts` und läuft
 * bei JEDEM App-Boot automatisch (`lib/db/auto-migrate.ts`, Schritt 5) — ein
 * frisches System braucht diesen Aufruf also nicht mehr. Das Skript bleibt
 * für den manuellen Anstoß: nach einer Änderung an
 * `DECLARED_ROLES` gegen eine laufende Umgebung, ohne den Pod neu
 * zu starten.
 *
 * ACHTUNG: der Abgleich ist beidseitig. Capabilities, die der Code für eine
 * System-Rolle nicht mehr deklariert, werden in der DB GELÖSCHT — genau
 * dafür ist er da (eine Entziehung im Code muss ankommen). Nicht-System-
 * Rollen bleiben unangetastet.
 *
 * Usage:
 *   DATABASE_URL='postgres://…' npx tsx scripts/seed-system-roles.ts
 */
import { db } from "@/lib/db/client";
import { syncSystemRoles } from "@/lib/db/initializers/system-roles";
import { redactError } from "@/lib/log-redact";

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error("✗ DATABASE_URL ist nicht gesetzt.");
    process.exit(1);
  }

  const summary = await syncSystemRoles(db);
  console.log(`✓ ${summary}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("✗ Seed fehlgeschlagen:", redactError(err));
  process.exit(1);
});

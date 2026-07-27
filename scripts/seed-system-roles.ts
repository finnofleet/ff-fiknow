/**
 * Seedet die beiden System-Rollen (`curator`, `admin`) + ihre
 * Rollen×Capability-Matrix in die neuen `roles`/`role_capabilities`-Tabellen
 * (ADR 0007, Phase P1 — „Rechte-Achse").
 *
 * EINE Quelle: `SYSTEM_ROLE_CAPABILITIES` aus `lib/auth/capabilities.ts` —
 * dieselbe Konstante, aus der auch die Laufzeit-Ableitung
 * (`capabilitiesForLegacyRole`) speist. Ändert sich dort das Capability-Set
 * einer System-Rolle, holt ein erneuter Seed-Lauf die Matrix nach.
 *
 * Idempotent: `roles.key` ist unique, Upsert via `onConflictDoUpdate`
 * (No-Op-Update auf Label/Beschreibung) liefert die `id` in jedem Fall
 * zurück — egal ob neu eingefügt oder schon vorhanden. `role_capabilities`
 * hat einen Unique-Index auf `(role_id, capability)`; Inserts laufen mit
 * `onConflictDoNothing`, mehrfaches Ausführen erzeugt keine Duplikate.
 *
 * P1-Stand: diese Tabellen werden zur Laufzeit NOCH NICHT gelesen (die
 * Permission-Checks laufen weiter über den Compat-Shim aus der bestehenden
 * `profiles.role`-Single-Role). Dieser Seed legt nur das Fundament für die
 * spätere admin-editierbare Matrix (ADR 0007 §2/§8).
 *
 * Usage:
 *   DATABASE_URL='postgres://…' npx tsx scripts/seed-system-roles.ts
 */
import { SYSTEM_ROLE_CAPABILITIES } from "@/lib/auth/capabilities";
import { ROLE_DESCRIPTION, ROLE_LABEL } from "@/lib/auth/roles";
import { db, schema } from "@/lib/db/client";

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error("✗ DATABASE_URL ist nicht gesetzt.");
    process.exit(1);
  }

  for (const key of Object.keys(SYSTEM_ROLE_CAPABILITIES) as Array<
    keyof typeof SYSTEM_ROLE_CAPABILITIES
  >) {
    const label = ROLE_LABEL[key];
    const description = ROLE_DESCRIPTION[key];
    const capabilities = SYSTEM_ROLE_CAPABILITIES[key];

    const [role] = await db
      .insert(schema.roles)
      .values({ key, label, description, isSystem: true })
      .onConflictDoUpdate({
        target: schema.roles.key,
        set: { label, description, isSystem: true },
      })
      .returning({ id: schema.roles.id });

    if (!role) {
      throw new Error(`Upsert von Rolle "${key}" lieferte keine Zeile zurück.`);
    }

    for (const capability of capabilities) {
      await db
        .insert(schema.roleCapabilities)
        .values({ roleId: role.id, capability })
        .onConflictDoNothing({
          target: [
            schema.roleCapabilities.roleId,
            schema.roleCapabilities.capability,
          ],
        });
    }

    console.log(
      `✓ Rolle "${key}" (${role.id}) — ${capabilities.length} Capability(s) geseedet.`,
    );
  }

  console.log("✓ System-Rollen-Seed abgeschlossen.");
  process.exit(0);
}

main().catch((err) => {
  console.error("✗ Seed fehlgeschlagen:", err);
  process.exit(1);
});

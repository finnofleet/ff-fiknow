/**
 * Initializer: System-Rollen-Matrix (ADR 0007 §2).
 *
 * Spiegelt `DECLARED_ROLES` (Code) in die Tabellen `roles` /
 * `role_capabilities`. Läuft bei JEDEM Boot (siehe `../initializers`), damit
 * ein frisches System ohne manuellen Schritt vollständig hochkommt.
 *
 * **Abgleichend, nicht nur ergänzend — und das ist der Punkt.** Der frühere
 * `scripts/seed-system-roles.ts` fügte nur hinzu (`onConflictDoNothing`) und
 * löschte nie. Damit war eine Rechte-ENTZIEHUNG im Code nicht in die DB
 * übertragbar: nimmt man einer System-Rolle eine Capability weg, blieb die
 * DB-Zeile stehen — und weil die effektiven Capabilities eine VEREINIGUNG
 * sind (`resolveEffectiveCapabilities`), behielt die Rolle das Recht
 * trotzdem. Eine Entziehung wäre also still ins Leere gelaufen. Deshalb wird
 * hier auch entfernt, was der Code nicht mehr deklariert.
 *
 * **Eigentümerschaft je Rollen-Art:**
 *  - `isSystem = true` → der Code besitzt sie. Voller Abgleich: fehlende
 *    Capabilities anlegen, nicht mehr deklarierte löschen; nicht mehr
 *    deklarierte System-Rollen selbst ebenfalls löschen.
 *  - `isSystem = false` → die DB besitzt sie (admin-pflegbar, künftig per
 *    UI). Dieser Initializer fasst sie NIE an.
 */
import { and, eq, notInArray } from "drizzle-orm";
import { DECLARED_ROLES } from "@/lib/auth/capabilities";
import { roleCapabilities, roles } from "@/lib/db/schema";

import type { InitializerDb } from "./index";

export async function syncSystemRoles(db: InitializerDb): Promise<string> {
  const declaredKeys = Object.keys(DECLARED_ROLES);

  let added = 0;
  let removed = 0;

  for (const key of declaredKeys) {
    const { label, description, capabilities: declared } = DECLARED_ROLES[key]!;

    const [role] = await db
      .insert(roles)
      .values({ key, label, description, isSystem: true })
      .onConflictDoUpdate({
        target: roles.key,
        set: { label, description, isSystem: true },
      })
      .returning({ id: roles.id });

    if (!role) {
      throw new Error(`Upsert von Rolle "${key}" lieferte keine Zeile zurück.`);
    }

    // Fehlende Capabilities ergänzen.
    for (const capability of declared) {
      const inserted = await db
        .insert(roleCapabilities)
        .values({ roleId: role.id, capability })
        .onConflictDoNothing({
          target: [roleCapabilities.roleId, roleCapabilities.capability],
        })
        .returning({ id: roleCapabilities.id });
      if (inserted.length > 0) added += 1;
    }

    // Nicht mehr deklarierte Capabilities entfernen. `declared` ist für die
    // heutigen System-Rollen nie leer; die Guard hält `notInArray` trotzdem
    // von einer leeren Liste fern (ungültiges SQL).
    if (declared.length > 0) {
      const dropped = await db
        .delete(roleCapabilities)
        .where(
          and(
            eq(roleCapabilities.roleId, role.id),
            notInArray(roleCapabilities.capability, [...declared]),
          ),
        )
        .returning({ id: roleCapabilities.id });
      removed += dropped.length;
    }
  }

  // System-Rollen, die der Code nicht mehr kennt, verschwinden ebenfalls —
  // sonst bliebe eine umbenannte/gestrichene Rolle als Rechtequelle liegen.
  // Ihre `role_capabilities` gehen per FK-loser Aufräumung gleich mit.
  const staleRoles = await db
    .delete(roles)
    .where(
      and(eq(roles.isSystem, true), notInArray(roles.key, [...declaredKeys])),
    )
    .returning({ id: roles.id, key: roles.key });
  for (const stale of staleRoles) {
    await db.delete(roleCapabilities).where(eq(roleCapabilities.roleId, stale.id));
  }

  return (
    `${declaredKeys.length} System-Rolle(n) abgeglichen ` +
    `(+${added} Capability(s), -${removed}` +
    (staleRoles.length > 0
      ? `, ${staleRoles.length} verwaiste Rolle(n) entfernt`
      : "") +
    ")"
  );
}

/**
 * Initializer: `profiles.role_keys` für Bestandsprofile nachziehen.
 *
 * **Warum das nötig ist.** Rechte UND Pflichtschulungs-Ziele lesen seit dem
 * Abschluss der Rechte-Achse ausschließlich `profiles.role_keys`. Geschrieben
 * wird die Spalte aber erst beim Login (`provisionProfile`). Ohne Backfill
 * hätte also jede Person, die seit dem Deploy nicht eingeloggt war, eine
 * leere Key-Menge — und damit weder Rechte noch eine Zuweisung zu
 * Pflichtschulungen. Der zweite Teil ist der gefährliche: die Nachweise
 * sähen unverändert grün aus, es fehlten nur lautlos Personen. Genau die
 * Fehlerrichtung, wegen der es ADR 0011 überhaupt gibt.
 *
 * Leitet die Menge aus der vorhandenen Rang-Rolle ab — dieselbe Funktion, die
 * auch der Login benutzt (`completeRoleKeys`), damit Backfill und Login
 * garantiert dasselbe Ergebnis liefern. Gruppen-Treffer kann der Backfill
 * nicht kennen (die stehen nur im Token); die kommen beim nächsten Login
 * dazu. Für die Basis-Zuweisung reicht die Rang-Rolle.
 *
 * Läuft nur über Zeilen mit `role_keys IS NULL` — eine bereits beim Login
 * gefüllte Menge wird NIE überschrieben, sonst würde der Backfill die aus
 * dem Token gewonnenen Gruppen-Treffer wieder wegräumen.
 */
import { eq, isNull } from "drizzle-orm";

import { completeRoleKeys } from "@/lib/auth/role-keys";
import { normalizeRole } from "@/lib/auth/roles";
import { profiles } from "@/lib/db/schema";

import type { InitializerDb } from "./index";

export async function backfillRoleKeys(db: InitializerDb): Promise<string> {
  const pending = await db
    .select({ userId: profiles.userId, role: profiles.role })
    .from(profiles)
    .where(isNull(profiles.roleKeys));

  if (pending.length === 0) return "keine Profile ohne Rollen-Keys";

  // Bewusst zeilenweise: die Key-Menge haengt von der jeweiligen Rang-Rolle
  // ab, ein einziges UPDATE koennte sie nicht unterscheiden.
  let updated = 0;
  for (const row of pending) {
    await db
      .update(profiles)
      .set({ roleKeys: completeRoleKeys(normalizeRole(row.role), []) })
      .where(eq(profiles.userId, row.userId));
    updated += 1;
  }

  return `${updated} Profil(e) nachgezogen`;
}

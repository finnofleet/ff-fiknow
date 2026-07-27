/**
 * I/O-Aufloesung des Betrachter-Scopes (ADR 0007 §3, Phase P2b).
 *
 * Liest die Rollen-Zuweisungen einer Person, die eine bestimmte *scoped*
 * Capability tragen (z. B. `compliance:view-named`), und leitet daraus den
 * effektiven ViewerScope ab (reine Logik: `viewerScopeFromAssignments`).
 *
 * **Gate/Shippability (ADR 0007 P2b):** existiert keine passende (scoped)
 * Zuweisung, ist das Ergebnis `unrestricted` — identisch zum heutigen
 * Verhalten „curator/admin sehen alles". Erst eine bewusste scoped Zuweisung
 * schaltet die Einschraenkung scharf. Im aktuellen Bestand gibt es keine
 * `role_assignments` -> jeder Betrachter ist `unrestricted`.
 *
 * **Fail-open (bewusst, transitional):** schlaegt die Aufloesung fehl, wird
 * `unrestricted` zurueckgegeben und laut geloggt. In P2b erreichen nur
 * curator/admin diesen Pfad (die ohnehin alles sehen duerfen), ein Fehler
 * veraendert ihre Sicht also nicht. **Sobald P3 scoped Nicht-Admins Zugriff
 * gibt, MUSS dies auf fail-closed umgestellt werden** (ADR 0007 §10:
 * App-Code ist bis zur RLS-Haertung die einzige Verteidigungslinie).
 */
import { and, eq } from "drizzle-orm";

import type { Capability } from "@/lib/auth/capabilities";
import { db } from "@/lib/db/client";
import { roleAssignments, roleCapabilities } from "@/lib/db/schema";

import { viewerScopeFromAssignments, type ViewerScope } from "./entity-scope";

export async function resolveViewerScope(
  userId: string,
  capability: Capability,
): Promise<ViewerScope> {
  try {
    const rows = await db
      .select({
        scopeLand: roleAssignments.scopeLand,
        scopeBu: roleAssignments.scopeBu,
      })
      .from(roleAssignments)
      .innerJoin(
        roleCapabilities,
        eq(roleCapabilities.roleId, roleAssignments.roleId),
      )
      .where(
        and(
          eq(roleAssignments.userId, userId),
          eq(roleCapabilities.capability, capability),
        ),
      );
    return viewerScopeFromAssignments(rows);
  } catch (err) {
    console.error(
      "[training/viewer-scope] resolveViewerScope fehlgeschlagen — " +
        "fail-open auf unrestricted (siehe Datei-Kopf: vor P3 auf fail-closed umstellen)",
      err,
    );
    return { kind: "unrestricted" };
  }
}

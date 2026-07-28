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
 * **Fail-closed (ADR 0007 §10, seit P3a):** schlaegt die Aufloesung fehl,
 * wird eine leere Grant-Menge (`scoped`/keine Grants) zurueckgegeben — der
 * Loader zeigt dann NICHTS statt alles. Seit P3a koennen scoped Nicht-Admins
 * Zugang haben; ein Fehler darf nicht in einen Cross-Entity-Leak umschlagen.
 * curator/admin ohne Zuweisungen sind nicht betroffen (erfolgreicher
 * 0-Zeilen-Fall -> unrestricted, nicht Fehlerfall).
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
    // Fail-closed (ADR 0007 §10, ab Phase P3a): kann der Scope nicht aufgeloest
    // werden, wird NICHTS gezeigt (leere Grant-Menge => passesViewerScope ist
    // fuer jede Zeile false) statt "sieht alles". Seit P3a koennen scoped
    // Nicht-Admins Zugang haben; ein Fehler darf dann nicht in einen
    // Cross-Entity-Leak umschlagen. Ein curator/admin ohne Zuweisungen ist
    // davon NICHT betroffen — der ist der erfolgreiche 0-Zeilen-Fall
    // (-> unrestricted), nicht der Fehlerfall.
    console.error(
      "[training/viewer-scope] resolveViewerScope fehlgeschlagen — fail-closed (zeigt nichts)",
      err,
    );
    return { kind: "scoped", grants: [] };
  }
}

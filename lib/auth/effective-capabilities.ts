/**
 * Effektive Capabilities eines Users zur Laufzeit (ADR 0007 §2, Phase P3a).
 *
 * Vereinigung ("additiv", ADR 0007 §2) aus:
 *  - den Legacy-Single-Role-Capabilities (`capabilitiesForLegacyRole` ueber
 *    `profiles.role` aus der Session) — haelt das heutige Verhalten fuer
 *    curator/admin exakt bei,
 *  - den Capabilities aus den additiven Rollen-Zuweisungen der Person
 *    (`role_assignments` -> `role_capabilities`).
 *
 * Das ist der Punkt, an dem `role_capabilities` ERSTMALS zur Laufzeit gelesen
 * wird (in P1 war die Tabelle nur Fundament). Unbekannte DB-Capability-Strings
 * werden defensiv ignoriert (`mergeDbCapabilities`).
 *
 * **Fail-safe/fail-closed:** schlaegt der DB-Read fehl, werden NUR die
 * Legacy-Capabilities zurueckgegeben. Ein curator/admin behaelt damit seine
 * Rechte; ein rein per Zuweisung berechtigter Betrachter bekommt nichts
 * (= fail-closed fuer genau den, der auf die Zuweisung angewiesen ist).
 */
import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { roleAssignments, roleCapabilities } from "@/lib/db/schema";

import {
  capabilitiesForLegacyRole,
  mergeDbCapabilities,
  type Capability,
} from "./capabilities";
import type { Role } from "./roles";

export async function resolveEffectiveCapabilities(
  userId: string,
  legacyRole: Role,
): Promise<Set<Capability>> {
  const caps = capabilitiesForLegacyRole(legacyRole);
  try {
    const rows = await db
      .select({ capability: roleCapabilities.capability })
      .from(roleAssignments)
      .innerJoin(
        roleCapabilities,
        eq(roleCapabilities.roleId, roleAssignments.roleId),
      )
      .where(eq(roleAssignments.userId, userId));
    mergeDbCapabilities(
      caps,
      rows.map((r) => r.capability),
    );
  } catch (err) {
    console.error(
      "[auth/effective-capabilities] resolveEffectiveCapabilities fehlgeschlagen — " +
        "nur Legacy-Caps (fail-closed fuer reine Zuweisungs-Betrachter)",
      err,
    );
  }
  return caps;
}

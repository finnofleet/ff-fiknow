/**
 * Effektive Capabilities eines Users zur Laufzeit (ADR 0007 §2).
 *
 * **Ein Rollen-Modell, drei Quellen — Vereinigung, keine Hierarchie.** Rollen
 * sind Bündel von Rechten; wer mehrere hält, hält deren Summe. Genau das
 * macht orthogonale Rollen ausdrückbar („Admin UND Compliance-Einsicht"),
 * ohne sie in einen linearen Rang zu pressen, in den sie nicht gehören (der
 * frühere `ROLE_RANK` ist entfallen; auch die Pflichtschulungs-Ziele laufen
 * jetzt über Mengen-Zugehörigkeit, siehe `completeRoleKeys`).
 *
 * **EINE Quelle: die Rollen-Matrix.** Rollen sind Zeilen in `roles` +
 * `role_capabilities`; welche eine Person hält, kommt aus dem IdP. Die
 * Rang-Rolle (`profiles.role`) ist dabei nur ein weiterer Key — sie wird
 * gleich behandelt wie die aus Keycloak-Gruppen aufgelösten Keys, statt
 * daneben aus einer zweiten, code-seitigen Tabelle abgeleitet zu werden.
 *
 * Vereinigung aus:
 *  1. **Matrix für `profiles.role_keys`** — die beim Login zusammengesetzte
 *     vollständige Key-Menge (`completeRoleKeys`). Der Rang-Key darf darin
 *     ein Rang-Name sein, weil er aus dem vertrauenswürdigen `OIDC_ROLE_MAP`
 *     stammt; die aus Gruppen geernteten Keys dürfen das NICHT
 *     (`resolveKnownRoleKeys` filtert sie, sonst Eskalation über
 *     `/Irgendwas/Admin`).
 *  2. **Personengebundene Zuweisungen** (`role_assignments` →
 *     `role_capabilities`) — der manuelle Ausnahme-Pfad via
 *     `scripts/set-role-assignment.ts`. Bleibt additiv daneben bestehen.
 *
 * `DECLARED_ROLES` (`capabilities.ts`) ist damit reine SAAT: der
 * Boot-Initializer schreibt sie in die Matrix, gelesen wird nur die Matrix.
 * Eine Änderung dort wirkt beim nächsten Boot — inklusive Entzug, weil der
 * Initializer abgleicht statt nur zu ergänzen.
 *
 * Unbekannte DB-Capability-Strings werden defensiv ignoriert
 * (`mergeDbCapabilities`) — die DB kann keine Rechte „erfinden", die der Code
 * nicht durchsetzt.
 *
 * **Fail-closed:** schlaegt der DB-Read fehl, ist das Ergebnis LEER — niemand
 * bekommt Rechte. Das ist die Kehrseite der Einzelquelle und bewusst so: ein
 * stiller Teil-Zustand waere schlimmer als ein sichtbarer Ausfall. Aus
 * demselben Grund bricht `SKIP_DB_INIT=true` die Berechtigung komplett (die
 * Matrix wird dann nie befuellt) — siehe `lib/db/auto-migrate.ts`.
 */
import { eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { roleAssignments, roleCapabilities, roles } from "@/lib/db/schema";
import { redactError } from "@/lib/log-redact";

import { mergeDbCapabilities, type Capability } from "./capabilities";
import type { Role } from "./roles";

export async function resolveEffectiveCapabilities(
  userId: string,
  legacyRole: Role,
  roleKeys: string[],
): Promise<Set<Capability>> {
  const caps = new Set<Capability>();

  try {
    // (a) Matrix fuer die Key-Menge der Person. Sie ist beim Login bereits
    // VOLLSTAENDIG zusammengesetzt (`completeRoleKeys`: Rang-Rolle +
    // Implikationen + impliziter `learner` + Gruppen-Treffer), deshalb hier
    // keine Sonderbehandlung der Rang-Rolle mehr — nur noch Mengenlogik.
    if (roleKeys.length === 0) return caps;
    const rows = await db
      .select({ capability: roleCapabilities.capability })
      .from(roles)
      .innerJoin(roleCapabilities, eq(roleCapabilities.roleId, roles.id))
      .where(inArray(roles.key, roleKeys));
    mergeDbCapabilities(
      caps,
      rows.map((r) => r.capability),
    );

    // (b) Personengebundene Zuweisungen — der manuelle Ausnahme-Pfad
    // (`scripts/set-role-assignment.ts`). Bleibt additiv daneben bestehen,
    // damit ein per CLI gesetzter Sonderfall nicht stillschweigend wegfaellt.
    const assigned = await db
      .select({ capability: roleCapabilities.capability })
      .from(roleAssignments)
      .innerJoin(
        roleCapabilities,
        eq(roleCapabilities.roleId, roleAssignments.roleId),
      )
      .where(eq(roleAssignments.userId, userId));
    mergeDbCapabilities(
      caps,
      assigned.map((r) => r.capability),
    );
  } catch (err) {
    console.error(
      "[auth/effective-capabilities] resolveEffectiveCapabilities fehlgeschlagen — " +
        "KEINE Capabilities (fail-closed, Einzelquelle Matrix)",
      redactError(err),
    );
  }
  return caps;
}

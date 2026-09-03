/**
 * I/O fuer den Rechte-Inspektor (ADR 0007 §8): fasst fuer einen User die
 * effektiven Rechte + Scopes zusammen — read-only, aendert nichts. Gibt die
 * Nachvollziehbarkeit, die Variante A (Scope als erstklassiger Wert statt
 * eigener Rolle) im Rollennamen nicht hat.
 */
import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { profiles, roleAssignments, roleCapabilities, roles } from "@/lib/db/schema";
import { type ViewerScope } from "@/lib/training/entity-scope";
import { resolveViewerScope } from "@/lib/training/viewer-scope";

import { type Capability, SCOPED_CAPABILITIES } from "./capabilities";
import { resolveEffectiveCapabilities } from "./effective-capabilities";
import type { Role } from "./roles";

export type InspectableProfile = {
  userId: string;
  displayName: string | null;
  role: Role;
};

export type InspectedAssignment = {
  roleKey: string;
  roleLabel: string;
  scopeLand: string[] | null;
  scopeBu: string[] | null;
  capabilities: string[];
};

export type InspectedScope = { capability: Capability; scope: ViewerScope };

export type RightsInspection = {
  userId: string;
  displayName: string | null;
  legacyRole: Role;
  /**
   * Die aus dem IdP aufgeloesten Rollen-Keys (ADR 0007 §2). Gehoeren in den
   * Inspektor, weil sie seit dem Abschluss der Rechte-Achse eine QUELLE der
   * effektiven Capabilities sind — ohne sie zeigte er ein Ergebnis ohne
   * seine Herkunft.
   */
  roleKeys: string[];
  land: string | null;
  bu: string | null;
  effectiveCapabilities: Capability[];
  assignments: InspectedAssignment[];
  scopedCapabilities: InspectedScope[];
};

/** Alle Profile fuer die Auswahlliste (userId, Name, Legacy-Rolle). */
export async function listInspectableProfiles(): Promise<InspectableProfile[]> {
  const rows = await db
    .select({
      userId: profiles.userId,
      displayName: profiles.displayName,
      role: profiles.role,
    })
    .from(profiles);
  return rows
    .map((r) => ({ userId: r.userId, displayName: r.displayName, role: r.role as Role }))
    .sort((a, b) => (a.displayName ?? a.userId).localeCompare(b.displayName ?? b.userId));
}

/** Vollstaendige Rechte-Inspektion eines Users; null wenn kein Profil. */
export async function inspectUserRights(userId: string): Promise<RightsInspection | null> {
  const [profile] = await db
    .select({
      userId: profiles.userId,
      displayName: profiles.displayName,
      role: profiles.role,
      land: profiles.land,
      bu: profiles.bu,
      roleKeys: profiles.roleKeys,
    })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  if (!profile) return null;

  const legacyRole = profile.role as Role;
  // Dieselbe Key-Menge, aus der auch zur Laufzeit die Capabilities entstehen
  // (ADR 0007 §2) — sonst zeigte der Inspektor weniger Rechte an, als die
  // Person tatsaechlich hat, und waere als Nachweis wertlos.
  const roleKeys = profile.roleKeys ?? [];

  const effective = await resolveEffectiveCapabilities(userId, legacyRole, roleKeys);
  const effectiveCapabilities = [...effective].sort();

  // Zuweisungen (Rolle + Scope) + je Rolle deren Capabilities.
  const assignmentRows = await db
    .select({
      roleId: roleAssignments.roleId,
      roleKey: roles.key,
      roleLabel: roles.label,
      scopeLand: roleAssignments.scopeLand,
      scopeBu: roleAssignments.scopeBu,
    })
    .from(roleAssignments)
    .innerJoin(roles, eq(roles.id, roleAssignments.roleId))
    .where(eq(roleAssignments.userId, userId));

  const assignments: InspectedAssignment[] = [];
  for (const a of assignmentRows) {
    const caps = await db
      .select({ capability: roleCapabilities.capability })
      .from(roleCapabilities)
      .where(eq(roleCapabilities.roleId, a.roleId));
    assignments.push({
      roleKey: a.roleKey,
      roleLabel: a.roleLabel,
      scopeLand: a.scopeLand,
      scopeBu: a.scopeBu,
      capabilities: caps.map((c) => c.capability).sort(),
    });
  }

  // Je scoped Capability, die der User TATSAECHLICH hat, den Scope aufloesen.
  const scopedCapabilities: InspectedScope[] = [];
  for (const cap of SCOPED_CAPABILITIES) {
    if (effective.has(cap)) {
      scopedCapabilities.push({ capability: cap, scope: await resolveViewerScope(userId, cap) });
    }
  }

  return {
    userId: profile.userId,
    displayName: profile.displayName,
    legacyRole,
    roleKeys,
    land: profile.land,
    bu: profile.bu,
    effectiveCapabilities,
    assignments,
    scopedCapabilities,
  };
}

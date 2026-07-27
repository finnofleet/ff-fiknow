/**
 * Capability-Schicht (ADR 0007, Phase P1 — „Rechte-Achse").
 *
 * Capabilities sind eine **feste, code-durchgesetzte Liste** — analog zu
 * Confluences fixen Berechtigungstypen (View/Edit/Admin). Jede Capability
 * wird irgendwo im Code tatsächlich geprüft/durchgesetzt; sie kann daher
 * NICHT in der UI „erfunden" werden (im Gegensatz zu Rollen, die künftig
 * frei benennbar sind, ADR 0007 §2).
 *
 * `SYSTEM_ROLE_CAPABILITIES` ist die **Single Source of Truth** für die
 * beiden heutigen System-Rollen (`curator`, `admin`) — sowohl für die
 * Laufzeit-Ableitung hier im Code als auch für den DB-Seed
 * (`scripts/seed-system-roles.ts`), der `roles` + `role_capabilities` daraus
 * befüllt. Eine Änderung hier ist also gleichzeitig die Änderung am Seed.
 *
 * **P1-Stand:** die Laufzeit-Durchsetzung bleibt code-abgeleitet über den
 * Compat-Shim `capabilitiesForLegacyRole` (weiterhin die bestehende
 * Single-Role aus `profiles.role`, siehe `lib/auth/roles.ts`). Die neuen
 * DB-Tabellen (`roles`, `role_capabilities`, `role_assignments`,
 * `lib/db/schema.ts`) sind in P1 nur das **Fundament** — sie werden noch
 * nicht zur Laufzeit gelesen. Das kommt erst mit der admin-editierbaren
 * Matrix + additiven Rollen-Zuweisungen (spätere Phasen, ADR 0007 §2/§8).
 */
import type { Role } from "./roles";

/** Feste Liste — jede Capability wird irgendwo im Code durchgesetzt. */
export type Capability =
  | "courses:manage"
  | "users:manage"
  | "compliance:view-named"
  | "compliance:view-aggregate"
  | "compliance:export"
  | "audit:view"
  | "reindex:run";

export const ALL_CAPABILITIES: Capability[] = [
  "courses:manage",
  "users:manage",
  "compliance:view-named",
  "compliance:view-aggregate",
  "compliance:export",
  "audit:view",
  "reindex:run",
];

/**
 * Capability-Set der beiden heutigen System-Rollen. `admin` = `curator`-Set
 * + `users:manage` + `audit:view` (Curator-Rechte plus Nutzerverwaltung +
 * Audit-Log-Einsicht). Diese Konstante ist die Quelle für den DB-Seed.
 */
export const SYSTEM_ROLE_CAPABILITIES: Record<"curator" | "admin", Capability[]> = {
  curator: [
    "courses:manage",
    "compliance:view-named",
    "compliance:export",
    "reindex:run",
  ],
  admin: [
    "courses:manage",
    "compliance:view-named",
    "compliance:export",
    "reindex:run",
    "users:manage",
    "audit:view",
  ],
};

/**
 * Vereinigung der Capabilities über eine Menge von Rollen-Keys. Unbekannte
 * Keys werden defensiv ignoriert (kein Throw) — Tippfehler oder künftige,
 * noch nicht ausgerollte Rollen-Keys sollen nicht versehentlich Rechte
 * gewähren oder die Anwendung zum Absturz bringen.
 *
 * In P1 sind nur die System-Keys (`curator`, `admin`) bekannt; frei
 * benennbare Rollen (ADR 0007 §2, `roles`-Tabelle) kommen in einer späteren
 * Phase dazu, sobald `role_capabilities` zur Laufzeit gelesen wird.
 */
export function capabilitiesForRoleKeys(keys: string[]): Set<Capability> {
  const result = new Set<Capability>();
  for (const key of keys) {
    const caps =
      key === "curator" || key === "admin"
        ? SYSTEM_ROLE_CAPABILITIES[key]
        : undefined;
    if (!caps) continue;
    for (const cap of caps) result.add(cap);
  }
  return result;
}

/**
 * Compat-Shim: leitet aus der bestehenden Single-Role (`Role`,
 * `lib/auth/roles.ts`) das äquivalente Capability-Set ab. `suspended` und
 * `learner` tragen keine Capabilities — `suspended` ist ein Deny-all-Status,
 * `learner` ist der implizite Grundzustand ohne verwaltete Rolle (ADR 0007
 * §2). Das ist die Brücke, über die `roles.ts` seine Permission-Checks in
 * P1 weiterhin ohne DB-Zugriff auswerten kann.
 */
export function capabilitiesForLegacyRole(role: Role): Set<Capability> {
  if (role === "curator" || role === "admin") {
    return new Set(SYSTEM_ROLE_CAPABILITIES[role]);
  }
  return new Set();
}

/** Prüft, ob ein Capability-Set eine bestimmte Capability enthält. */
export function can(
  caps: ReadonlySet<Capability>,
  cap: Capability,
): boolean {
  return caps.has(cap);
}

import type { AuthStrategy } from "payload";

import type { Role } from "@/lib/auth/roles";

/**
 * Server-seitig aufgelöste Identität des eingeloggten Users.
 *
 * `id` ist der stabile Subject-Identifier — der `sub`-Claim aus dem
 * Keycloak-Token —, derselbe Wert, auf dem die Postgres-RLS via
 * `auth.uid()` aufsetzt (auth-Schema wird inline von
 * lib/db/auto-migrate.ts gebootstrapt).
 */
export type ServerIdentity = {
  id: string;
  email: string | null;
  displayName: string | null;
  role: Role;
  /**
   * Alle beim Login aufgelösten Rollen-Keys (ADR 0007 §2) — die Basis der
   * effektiven Capabilities als Vereinigung — und seit ADR 0011 (superseded)
   * auch die Zielmenge für Pflichtschulungen (Mengen-Zugehörigkeit statt
   * Rang). `role` bleibt daneben bestehen, weil sie etwas trägt, das KEINE
   * Rechte sind: den Deny-all-Status `suspended`. Wie `role` wird die Menge
   * pro Request frisch aus der DB gelesen, damit ein Entzug sofort greift.
   */
  roleKeys: string[];
};

/**
 * Auth-Provider-Abstraktion.
 *
 * Kapselt den providerspezifischen Teil — Token-/Session-Validierung und
 * die Quelle der Rolle — hinter einer Schnittstelle, damit der restliche
 * Code (Lerner-App + Payload-Admin) providerunabhängig bleibt.
 *
 * Aktive Implementierung (siehe lib/auth/provider/index.ts — kein
 * AUTH_PROVIDER-Schalter mehr, liefert fest den OIDC-Provider):
 *
 *   - `oidc`: OIDC-Relying-Party (z.B. Keycloak hinter Entra). Rolle wird
 *     aus den Token-Claims gemappt (Keycloak = Source of Truth).
 */
export interface AuthProvider {
  /** Stabiler Bezeichner, für Logs/Diagnose. */
  readonly name: string;

  /**
   * Payload-Admin-SSO-Bridge: lässt berechtigte User (curator/admin) ins
   * /admin-UI, ohne Doppel-Account. Wird in payload/collections/users.ts
   * als Auth-Strategy registriert.
   */
  readonly payloadStrategy: AuthStrategy;

  /**
   * Aktuelle Server-Session auflösen (Lerner-seitige Server-Components,
   * Route-Handler, Server-Actions). `null` = niemand eingeloggt — kein
   * Throw, damit der Aufrufer selbst entscheidet (401/Redirect/Anon).
   */
  getServerIdentity(): Promise<ServerIdentity | null>;
}

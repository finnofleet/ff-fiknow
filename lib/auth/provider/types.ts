import type { AuthStrategy } from "payload";

import type { Role } from "@/lib/auth/roles";

/**
 * Server-seitig aufgelöste Identität des eingeloggten Users.
 *
 * `id` ist der stabile Subject-Identifier (`sub`-Claim) — derselbe Wert,
 * auf dem die Postgres-RLS via `auth.uid()` aufsetzt (siehe
 * scripts/setup-auth.sql). Provider-unabhängig: GoTrue liefert die
 * GoTrue-User-ID, OIDC den `sub` aus dem Keycloak-Token.
 */
export type ServerIdentity = {
  id: string;
  email: string | null;
  displayName: string | null;
  role: Role;
};

/**
 * Auth-Provider-Abstraktion.
 *
 * Kapselt den providerspezifischen Teil — Token-/Session-Validierung und
 * die Quelle der Rolle — hinter einer Schnittstelle, damit der restliche
 * Code (Lerner-App + Payload-Admin) providerunabhängig bleibt.
 *
 * Aktive Implementierungen (gewählt über Env-Var AUTH_PROVIDER, siehe
 * lib/auth/provider/index.ts):
 *
 *   - `gotrue` (Default): Supabase-GoTrue. Rolle kommt aus public.profiles.
 *     Pfad für verstande.ch und Bestands-Deployments — unverändert.
 *   - `oidc`:             OIDC-Relying-Party (z.B. Keycloak hinter Entra).
 *     Rolle wird aus den Token-Claims gemappt (Keycloak = Source of Truth).
 *
 * Wer GoTrue später ablösen will, löscht schlicht die GoTrue-Implementierung
 * — die OIDC-Implementierung ist dann die einzige. Nichts geht verloren.
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

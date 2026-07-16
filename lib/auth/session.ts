/**
 * Server-Side-Helper für Auth + Role-Lookup.
 *
 * Dünne, providerunabhängige Fassade über den aktiven Auth-Provider
 * (lib/auth/provider). Die konkrete Session-Auflösung (GoTrue via Supabase-SSR
 * oder OIDC) liegt im Provider; hier nur der stabile Vertrag, den der Rest des
 * Codes nutzt:
 *
 *   1. Session auflösen (Provider)
 *   2. Capability-Check (lib/auth/roles)
 */
import { getAuthProvider } from "@/lib/auth/provider";
import type { ServerIdentity } from "@/lib/auth/provider";

import { canManageCourses } from "./roles";

/**
 * Eingeloggter User inkl. Rolle. Formgleich mit der Provider-`ServerIdentity`
 * — als eigener Name beibehalten, damit bestehende Importe (`SessionUser`)
 * unverändert weiterlaufen.
 */
export type SessionUser = ServerIdentity;

/**
 * Liest den eingeloggten User + dessen Rolle. Gibt `null` zurück wenn
 * niemand eingeloggt ist (kein Throw, damit Caller das selbst entscheidet:
 * 401-Response, Redirect, oder Anonymous-Fallback).
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  return getAuthProvider().getServerIdentity();
}

/**
 * Darf der aktuelle Betrachter Draft-Inhalte sehen? (Kuratoren + Admins.)
 *
 * Zentraler Gate für `ReadOptions.includeDrafts` (lib/content.ts) — Aufrufer
 * sollen NICHT selbst die Rolle ableiten, sondern dieses Ergebnis durchreichen,
 * damit der Draft-Zugriff an genau einer Stelle entschieden wird. Learner/Anon
 * → false → nur published.
 */
export async function viewerCanSeeDrafts(): Promise<boolean> {
  const user = await getCurrentUser();
  return user !== null && canManageCourses(user.role);
}

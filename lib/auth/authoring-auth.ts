/**
 * Geteilte Authentifizierung für die Authoring-Endpoints (import, export,
 * publish) — ADR 0001, Sicherheits-Anforderung 5.
 *
 * Akzeptiert ZWEI Wege:
 *   1. `Authorization: Bearer cat_…`  → Scoped Authoring-Token (Plugin/CLI)
 *   2. GoTrue-Session-Cookie          → Browser-UI (Fallback)
 *
 * In BEIDEN Fällen wird die Rolle frisch geprüft (`canManageCourses`) — der
 * Token backt keine Berechtigung ein, Rollenentzug wirkt sofort.
 *
 * Die Token-VERWALTUNG (Mint/List/Revoke) nutzt diesen Helper bewusst NICHT,
 * sondern verlangt eine echte Session — sonst könnte ein Token endlos neue
 * Tokens nachgenerieren und damit die TTL aushebeln (Privilege-Chaining).
 */
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { profiles } from "@/lib/db/schema";

import { canManageCourses, normalizeRole, type Role } from "./roles";
import { getCurrentUser } from "./session";
import { verifyAuthoringToken } from "./authoring-token";

export interface AuthoringPrincipal {
  id: string;
  role: Role;
  via: "token" | "session";
}

export type AuthoringAuthResult =
  | { ok: true; principal: AuthoringPrincipal }
  | {
      ok: false;
      status: 401 | 403;
      error: string;
      extra?: Record<string, unknown>;
    };

function forbidden(got: Role): AuthoringAuthResult {
  return {
    ok: false,
    status: 403,
    error: "insufficient_role",
    extra: { required: ["curator", "admin"], got },
  };
}

/**
 * Authentifiziert einen Authoring-Request. Bevorzugt den Bearer-Token; fällt
 * sonst auf die Session zurück. Ein vorhandener, aber ungültiger Bearer-Token
 * fällt NICHT auf die Session zurück (expliziter Fehler → 401).
 */
export async function authenticateAuthoring(
  request: NextRequest,
): Promise<AuthoringAuthResult> {
  const authHeader = request.headers.get("authorization");

  if (authHeader && /^Bearer\s+/i.test(authHeader)) {
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const verified = await verifyAuthoringToken(token);
    if (!verified) {
      return { ok: false, status: 401, error: "invalid_token" };
    }
    // Rolle frisch lesen — der Token trägt keine eingebackene Berechtigung.
    const [profile] = await db
      .select({ role: profiles.role })
      .from(profiles)
      .where(eq(profiles.userId, verified.userId))
      .limit(1);
    const role = normalizeRole(profile?.role);
    if (!canManageCourses(role)) return forbidden(role);
    return { ok: true, principal: { id: verified.userId, role, via: "token" } };
  }

  // Fallback: Browser-Session.
  const user = await getCurrentUser();
  if (!user) return { ok: false, status: 401, error: "not_logged_in" };
  if (!canManageCourses(user.role)) return forbidden(user.role);
  return { ok: true, principal: { id: user.id, role: user.role, via: "session" } };
}

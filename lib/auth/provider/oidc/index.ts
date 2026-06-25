/**
 * OIDC-Auth-Provider (Keycloak hinter Entra ID).
 *
 * Aktiviert über AUTH_PROVIDER=oidc. Die App ist OIDC-Relying-Party gegen ein
 * zentral betriebenes Keycloak; Keycloak ist Source of Truth für Rollen.
 *
 *   - getServerIdentity: liest die App-Session aus dem signierten ep_session-
 *     Cookie (Identity-Snapshot inkl. der beim Login gemappten Rolle).
 *   - payloadStrategy:   lässt curator/admin per derselben Session ins /admin
 *     (JIT-Provisioning des Payload-Records über externalId=sub).
 *
 * Der eigentliche Login-Flow (Code+PKCE) liegt in den Routes unter
 * app/(frontend)/auth/oidc/* und nutzt client.ts/session.ts/role-map.ts.
 */
import { randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import type { AuthStrategy } from "payload";

import { canSeeAdmin, normalizeRole, type Role } from "@/lib/auth/roles";
import { db } from "@/lib/db/client";
import { profiles } from "@/lib/db/schema";

import type { AuthProvider, ServerIdentity } from "../types";
import type { OidcClaims } from "./client";
import { oidcConfig } from "./config";
import { mapRole } from "./role-map";
import { SESSION_COOKIE, verifySession } from "./session";

// ============================================================
// Cookie-Helfer (eine benannte Cookie aus dem Cookie-Header)
// ============================================================

function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) {
      const raw = part.slice(eq + 1).trim();
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  return undefined;
}

// ============================================================
// Login-Provisioning (von der Callback-Route genutzt)
// ============================================================

/** App-Rolle aus den ID-Token-Claims (Keycloak = Source of Truth). */
export function resolveRole(claims: OidcClaims): Role {
  const cfg = oidcConfig();
  return mapRole(claims.raw, cfg.clientId, cfg.roleMap);
}

/**
 * Schreibt das profiles-Profil beim Login. Ohne GoTrue gibt es keinen
 * on_auth_user_created-Trigger — die Anlage passiert hier (idempotent).
 * Rolle wird IMMER aus Keycloak überschrieben (SoT); display_name nur, wenn
 * der IdP einen Wert liefert (sonst bestehenden Wert nicht nullen).
 */
export async function provisionProfile(
  claims: OidcClaims,
  role: Role,
): Promise<void> {
  const set: { role: Role; displayName?: string } = { role };
  if (claims.name) set.displayName = claims.name;

  await db
    .insert(profiles)
    .values({ userId: claims.sub, displayName: claims.name, role })
    .onConflictDoUpdate({ target: profiles.userId, set });
}

// ============================================================
// Provider-Schnittstelle
// ============================================================

/**
 * Rolle LIVE aus profiles lesen (nicht aus dem Cookie). Das Cookie liefert nur
 * die Identität (sub); die Rolle muss pro Request frisch kommen, damit ein
 * Admin-Suspend/-Demote SOFORT greift (sonst bliebe die beim Login eingebackene
 * Cookie-Rolle bis zum Ablauf gültig). Spiegelt das GoTrue-Verhalten.
 * Beim Login wird die Keycloak-Rolle (SoT) nach profiles geschrieben.
 */
async function liveRole(sub: string): Promise<Role> {
  const [row] = await db
    .select({ role: profiles.role })
    .from(profiles)
    .where(eq(profiles.userId, sub))
    .limit(1);
  return normalizeRole(row?.role);
}

async function getServerIdentity(): Promise<ServerIdentity | null> {
  const store = await cookies();
  const session = await verifySession(
    store.get(SESSION_COOKIE)?.value,
    oidcConfig().sessionSecret,
  );
  if (!session) return null;
  return {
    id: session.sub,
    email: session.email,
    displayName: session.name,
    role: await liveRole(session.sub),
  };
}

const payloadStrategy: AuthStrategy = {
  name: "oidc-session",
  authenticate: async ({ payload, headers }) => {
    const session = await verifySession(
      readCookie(headers.get("cookie"), SESSION_COOKIE),
      oidcConfig().sessionSecret,
    );
    if (!session) return { user: null };
    // Nur Curator/Admin dürfen ins Payload-Admin — Rolle LIVE aus profiles
    // (nicht aus dem Cookie), damit ein Entzug sofort greift.
    if (!canSeeAdmin(await liveRole(session.sub))) return { user: null };

    // Payload-Editor-Record über externalId=sub finden, sonst verknüpfen/anlegen
    // (JIT) — analog zur GoTrue-Strategy.
    const existing = await payload.find({
      collection: "users",
      where: { externalId: { equals: session.sub } },
      limit: 1,
      overrideAccess: true,
    });

    let editor = existing.docs[0];
    if (!editor) {
      const email = session.email ?? `${session.sub}@oidc.local`;

      // Verknüpfung mit einem bestehenden Payload-Account NUR über eine
      // VERIFIZIERTE E-Mail — sonst könnte ein Keycloak-Account mit
      // unverifizierter, fremder E-Mail einen bestehenden Editor übernehmen.
      // Ohne Verifikation: frischen Record allein über sub anlegen.
      const linkTarget = session.emailVerified
        ? (
            await payload.find({
              collection: "users",
              where: { email: { equals: email } },
              limit: 1,
              overrideAccess: true,
            })
          ).docs[0]
        : undefined;

      if (linkTarget) {
        editor = await payload.update({
          collection: "users",
          id: linkTarget.id,
          data: { externalId: session.sub },
          overrideAccess: true,
        });
        payload.logger.info(
          `[oidc-session] Bestehenden Account ${email} mit externalId verknüpft`,
        );
      } else {
        editor = await payload.create({
          collection: "users",
          data: {
            email,
            externalId: session.sub,
            // SSO-only Account: zufälliges, nicht ausgeliefertes Passwort.
            password: randomBytes(32).toString("hex"),
          },
          overrideAccess: true,
        });
        payload.logger.info(
          `[oidc-session] JIT-Provisioning Editor-Record für ${email}`,
        );
      }
    }

    return { user: { ...editor, collection: "users" } };
  },
};

export function createOidcProvider(): AuthProvider {
  // KEINE eager Config-Validierung hier: dieser Provider wird beim
  // `next build` (Page-Data-Collection) konstruiert, wo die OIDC-Env nicht
  // gesetzt ist. oidcConfig() wird lazy zur Request-Zeit aufgerufen
  // (authenticate / getServerIdentity / Routes / Middleware) und wirft dort
  // mit klarer Meldung, falls etwas fehlt.
  return { name: "oidc", payloadStrategy, getServerIdentity };
}

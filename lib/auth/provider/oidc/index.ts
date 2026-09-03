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

import {
  completeRoleKeys,
  diffRoleKeys,
  resolveKnownRoleKeys,
} from "@/lib/auth/role-keys";
import { recordAudit } from "@/lib/audit/log";
import { can } from "@/lib/auth/capabilities";
import { resolveEffectiveCapabilities } from "@/lib/auth/effective-capabilities";
import { normalizeRole, type Role } from "@/lib/auth/roles";
import { db } from "@/lib/db/client";
import { profiles } from "@/lib/db/schema";
import { isLandToken } from "@/lib/land-tokens";

import type { AuthProvider, ServerIdentity } from "../types";
import { firstClaimValue, resolveClaim } from "./claim-gate";
import type { OidcClaims } from "./client";
import { oidcConfig } from "./config";
import { extractRoleKeys, mapRole } from "./role-map";
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
 * Löst eine Scope-Achse aus den Claims auf und loggt den `unmapped`-Fall
 * (ADR 0007 §3, Claim-Gate). Rückgabe `undefined` heißt „nicht schreiben" —
 * NICHT „auf null setzen": ein IdP-Rename oder ein weggefallener Claim darf
 * einen bereits korrekt gesetzten Wert nicht löschen, sonst kippt ein
 * Konfigurationsfehler im IdP still die Compliance-Sichtbarkeit.
 */
function resolveScopeAxis(
  claims: OidcClaims,
  claimName: string,
  map: ReadonlyMap<string, string>,
  envVar: string,
  isKnownToken?: (v: string) => boolean,
): string | undefined {
  const resolution = resolveClaim(
    firstClaimValue(claims.raw, claimName),
    map,
    isKnownToken,
  );
  if (resolution.kind === "mapped") return resolution.value;
  if (resolution.kind === "unmapped") {
    // Kein Abbruch, kein Überschreiben: der Login gelingt, der Wert bleibt
    // ungesetzt. Sichtbar wird das über die Datenqualitäts-Anzeige im
    // Compliance-Dashboard (Personen „ohne Zuordnung") — dieses Log nennt
    // zusätzlich den Rohwert, damit die Map gezielt ergänzt werden kann.
    console.warn(
      `[oidc-claims] Claim "${claimName}" liefert "${resolution.raw}" — ` +
        `kein bekanntes App-Token und kein Eintrag in ${envVar}. Wert wird ` +
        "NICHT gespeichert; die Person erscheint in scoped Auswertungen als " +
        "„ohne Zuordnung“. Fix: Mapping ergänzen.",
    );
  }
  return undefined;
}

/**
 * Protokolliert eine BEOBACHTETE Änderung der Rollen-Menge (ADR 0007 §11).
 *
 * **Was hier bewusst NICHT behauptet wird: wer die Rolle vergeben hat.** Das
 * weiss diese App nicht und kann es nicht wissen — sie sieht beim Login nur
 * das Ergebnis in den Claims, nicht den Vorgang im IdP. Die
 * Rechenschaftsspur „wer hat zugewiesen" liegt in den **Keycloak-Admin-Events**
 * (dort mit handelndem Admin, eigener Aufbewahrung, eigenem Leserkreis) —
 * Keycloak ist das führende System für Rollen, also gehört sie dorthin.
 *
 * Was diese App beantworten kann und hier festhält: **seit wann** ein Konto
 * eine Rolle trägt. Zusammen mit den Keycloak-Admin-Events ergibt das die
 * vollständige Auskunft (wer + wann + Wirkung), ohne dass eine Seite etwas
 * vortäuscht, das sie nicht weiss.
 *
 * Ein Eintrag je geänderter Rolle, nur bei tatsächlicher Änderung (kein
 * Rauschen bei jedem Login). `actorUserId` ist die BETROFFENE Person — Akteur
 * und Subjekt fallen hier zusammen, weil die Änderung im Zuge ihres eigenen
 * Logins sichtbar wird. Best-effort wie jeder Audit-Schreibpfad.
 */
async function auditRoleKeyChanges(
  userId: string,
  rankRole: Role,
  previous: string[] | null,
  next: string[],
): Promise<void> {
  const { added, removed } = diffRoleKeys(previous, next);
  for (const key of added) {
    await recordAudit({
      action: "role.key-added",
      actorUserId: userId,
      actorRole: rankRole,
      source: "system",
      targetType: "role-key",
      targetId: key,
    });
  }
  for (const key of removed) {
    await recordAudit({
      action: "role.key-removed",
      actorUserId: userId,
      actorRole: rankRole,
      source: "system",
      targetType: "role-key",
      targetId: key,
    });
  }
}

/**
 * Schreibt das profiles-Profil beim Login (JIT-Provisioning, idempotent) —
 * es gibt keinen DB-Trigger, der das für uns tut. Rolle wird IMMER aus
 * Keycloak überschrieben (SoT); display_name nur, wenn der IdP einen Wert
 * liefert (sonst bestehenden Wert nicht nullen).
 *
 * Die Scope-Achsen `land` (aus dem `country`-Claim) und `bu` (aus dem via
 * `OIDC_ENTITY_CLAIM` benannten Claim) laufen durch das Claim-Gate
 * (`claim-gate.ts`): nur auflösbare Werte werden geschrieben, unbekannte
 * werden geloggt statt roh persistiert. Auch hier gilt — nur schreiben, wenn
 * der IdP einen auflösbaren Wert liefert; ein fehlender Claim nullt keinen
 * bestehenden Wert.
 */
export async function provisionProfile(
  claims: OidcClaims,
  role: Role,
): Promise<void> {
  const cfg = oidcConfig();

  // ADR 0007 §2: die VOLLE Rollen-Menge festhalten, nicht nur die vom Rang
  // gewonnene Einzelrolle — sonst sind orthogonale Rollen („Admin UND
  // Compliance-Einsicht") nicht ausdrückbar. `null` = Lookup fehlgeschlagen
  // → bestehende Keys bleiben stehen (ein DB-Aussetzer entzieht keine Rechte).
  const matched = await resolveKnownRoleKeys(
    extractRoleKeys(claims.raw, cfg.clientId),
  );
  // Die Menge ist ab hier VOLLSTÄNDIG: Rang-Rolle, was sie impliziert, der
  // implizite `learner` und die Gruppen-Treffer. Rechte UND
  // Pflichtschulungs-Ziele lesen nur noch sie — kein Rangvergleich mehr.
  const roleKeys = matched === null ? null : completeRoleKeys(role, matched);

  // Vorherige Menge lesen, BEVOR der Upsert sie überschreibt — nur so ist die
  // Änderung überhaupt erkennbar.
  const [before] = await db
    .select({ roleKeys: profiles.roleKeys })
    .from(profiles)
    .where(eq(profiles.userId, claims.sub))
    .limit(1);

  const land = resolveScopeAxis(
    claims,
    "country",
    cfg.landMap,
    "OIDC_LAND_MAP",
    isLandToken,
  );
  const bu = cfg.entityClaim
    ? resolveScopeAxis(
        claims,
        cfg.entityClaim,
        cfg.entityMap,
        "OIDC_ENTITY_MAP",
      )
    : undefined;

  const set: {
    role: Role;
    displayName?: string;
    land?: string;
    bu?: string;
    roleKeys?: string[];
  } = { role };
  if (claims.name) set.displayName = claims.name;
  if (land) set.land = land;
  if (bu) set.bu = bu;
  // Anders als land/bu IST die leere Menge hier eine gültige Aussage („diese
  // Person hat keine gematchte Rolle mehr") und muss geschrieben werden —
  // sonst überlebt ein entzogener Key den Entzug. Nur der Fehlerfall
  // (`null`) lässt den Bestand unberührt.
  if (roleKeys !== null) set.roleKeys = roleKeys;

  await db
    .insert(profiles)
    .values({
      userId: claims.sub,
      displayName: claims.name,
      role,
      land,
      bu,
      roleKeys: roleKeys ?? [],
    })
    .onConflictDoUpdate({ target: profiles.userId, set });

  if (roleKeys !== null) {
    await auditRoleKeyChanges(claims.sub, role, before?.roleKeys ?? null, roleKeys);
  }
}

// ============================================================
// Provider-Schnittstelle
// ============================================================

/**
 * Rolle LIVE aus profiles lesen (nicht aus dem Cookie). Das Cookie liefert nur
 * die Identität (sub); die Rolle muss pro Request frisch kommen, damit ein
 * Admin-Suspend/-Demote SOFORT greift (sonst bliebe die beim Login eingebackene
 * Cookie-Rolle bis zum Ablauf gültig). Beim Login wird die Keycloak-Rolle
 * (SoT) nach profiles geschrieben.
 */
async function liveProfile(
  sub: string,
): Promise<{ role: Role; roleKeys: string[] }> {
  const [row] = await db
    .select({ role: profiles.role, roleKeys: profiles.roleKeys })
    .from(profiles)
    .where(eq(profiles.userId, sub))
    .limit(1);
  return { role: normalizeRole(row?.role), roleKeys: row?.roleKeys ?? [] };
}

async function getServerIdentity(): Promise<ServerIdentity | null> {
  const store = await cookies();
  const session = await verifySession(
    store.get(SESSION_COOKIE)?.value,
    oidcConfig().sessionSecret,
  );
  if (!session) return null;
  const live = await liveProfile(session.sub);
  return {
    id: session.sub,
    email: session.email,
    displayName: session.name,
    role: live.role,
    roleKeys: live.roleKeys,
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
    const live = await liveProfile(session.sub);
    const caps = await resolveEffectiveCapabilities(
      session.sub,
      live.role,
      live.roleKeys,
    );
    if (!can(caps, "courses:manage")) return { user: null };

    // Payload-Editor-Record über externalId=sub finden, sonst beim Login
    // JIT ins profiles/users schreiben (verknüpfen oder neu anlegen).
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

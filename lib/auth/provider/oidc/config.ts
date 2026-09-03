/**
 * OIDC-Konfiguration aus der Runtime-Env — einmal validiert, dann gecached.
 *
 * Bewusst lazy (erst beim ersten Zugriff): `next build` evaluiert Module, ohne
 * dass die OIDC_*-Vars gesetzt sein müssen. Erst zur Request-Zeit (wenn
 * AUTH_PROVIDER=oidc aktiv ist) wird gelesen — fehlende Pflicht-Vars werfen
 * dann mit einer klaren Meldung, statt still ein unsicheres Default zu nutzen.
 */
import type { Role } from "@/lib/auth/roles";
import { normalizeRole } from "@/lib/auth/roles";

import { parseClaimMap } from "./claim-gate";

export type OidcConfig = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  /** Signaturschlüssel fürs Session-Cookie (HMAC). */
  sessionSecret: string;
  /** Scopes für den Authorization-Request. */
  scopes: string;
  /** Mapping Keycloak-Rolle/-Gruppe → App-Rolle. */
  roleMap: ReadonlyMap<string, Role>;
  /**
   * Mapping IdP-`country`-Claim-Wert → Land-Token (ADR 0007 §3). Optional:
   * die bekannten Tokens (`LAND_TOKENS`) gelten immer, die Map ergänzt nur
   * Übersetzungen für abweichende IdP-Schreibweisen (`LU` → `LUX`).
   */
  landMap: ReadonlyMap<string, string>;
  /**
   * Name des Claims, der die Rechtseinheit/Gesellschaft trägt (z. B.
   * `legal_entity`). `null` = die Achse wird nicht aus dem Token gefüllt
   * (heutiger Zustand, `profiles.bu` bleibt unberührt).
   */
  entityClaim: string | null;
  /**
   * Mapping Entity-Claim-Wert → App-Entity-Token. LEER = Pass-Through (der
   * Rohwert wird übernommen); GESETZT = Allowlist (alles Nicht-Gelistete
   * ist `unmapped`). n:1 erlaubt, damit mehrere Gesellschaften app-seitig
   * zu einer zusammengefasst werden können, bevor der Merger im IdP
   * nachzieht.
   */
  entityMap: ReadonlyMap<string, string>;
  /** Session-Lebensdauer in Sekunden (Cookie-Max-Age + exp-Claim). */
  sessionMaxAgeSec: number;
};

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    throw new Error(
      `${name} ist nicht gesetzt, wird aber für AUTH_PROVIDER=oidc benötigt.`,
    );
  }
  return v;
}

/**
 * Parst OIDC_ROLE_MAP = "finknow-curator:curator,finknow-admin:admin".
 * Schlüssel = Keycloak-Rolle/-Gruppe (case-insensitiv), Wert = App-Rolle.
 * Unbekannte App-Rollen-Werte werden via normalizeRole defensiv behandelt;
 * eine Map auf `learner` ist sinnlos (Default ist ohnehin learner) und wird
 * ignoriert, damit nur „erhebende" Mappings (curator/admin) zählen.
 */
function parseRoleMap(raw: string | undefined): ReadonlyMap<string, Role> {
  const map = new Map<string, Role>();
  if (!raw) return map;
  for (const pair of raw.split(",")) {
    const [k, v] = pair.split(":").map((s) => s?.trim());
    if (!k || !v) continue;
    const role = normalizeRole(v);
    if (role === "learner") continue;
    map.set(k.toLowerCase(), role);
  }
  return map;
}

let cached: OidcConfig | null = null;

export function oidcConfig(): OidcConfig {
  if (cached) return cached;

  // Dediziertes Session-Secret bevorzugt; sonst PAYLOAD_SECRET (immer gesetzt).
  // Mindestlänge erzwingen — ein kurzes/leeres Secret macht die HMAC-Signatur
  // wertlos.
  const sessionSecret = (
    process.env.OIDC_SESSION_SECRET?.trim() ||
    process.env.PAYLOAD_SECRET?.trim() ||
    ""
  );
  if (sessionSecret.length < 16) {
    throw new Error(
      "OIDC_SESSION_SECRET (oder PAYLOAD_SECRET) fehlt oder ist zu kurz (min. 16 Zeichen) — nötig zum Signieren des Session-Cookies.",
    );
  }

  const maxAge = Number(process.env.OIDC_SESSION_MAX_AGE_SEC ?? "");
  const sessionMaxAgeSec =
    Number.isFinite(maxAge) && maxAge > 0 ? Math.floor(maxAge) : 8 * 3600;

  cached = {
    // trailing slash am Issuer entfernen — sonst doppelte Slashes in den
    // Discovery-/Endpoint-URLs.
    issuer: required("OIDC_ISSUER").replace(/\/$/, ""),
    clientId: required("OIDC_CLIENT_ID"),
    clientSecret: required("OIDC_CLIENT_SECRET"),
    sessionSecret,
    scopes: process.env.OIDC_SCOPES?.trim() || "openid profile email",
    roleMap: parseRoleMap(process.env.OIDC_ROLE_MAP),
    landMap: parseClaimMap(process.env.OIDC_LAND_MAP),
    entityClaim: process.env.OIDC_ENTITY_CLAIM?.trim() || null,
    entityMap: parseClaimMap(process.env.OIDC_ENTITY_MAP),
    sessionMaxAgeSec,
  };
  return cached;
}

/**
 * Mapping der Keycloak-Autorisierung auf das App-Rollenmodell.
 *
 * Keycloak ist Source of Truth (Entscheidung): die App leitet die Rolle aus
 * den Token-Claims ab, NICHT aus einer App-internen Pflege. Berücksichtigt:
 *   - realm_access.roles            (Realm-Rollen)
 *   - resource_access[client].roles (Client-Rollen)
 *   - groups                        (Gruppen, z. B. "/FIKNOW/Curators")
 *
 * Aus allen gefundenen Strings (case-insensitiv, plus letztes Pfadsegment bei
 * Gruppen) wird gegen OIDC_ROLE_MAP gematcht. Höchste erreichte Rolle gewinnt
 * (admin > curator); ohne Treffer → learner (defensiver Default, nie zufällig
 * privilegiert).
 */
import type { Role } from "@/lib/auth/roles";

type Claims = Record<string, unknown>;

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** Alle für das Mapping relevanten Rollen-/Gruppen-Strings aus den Claims. */
export function extractRoleKeys(claims: Claims, clientId: string): string[] {
  const keys = new Set<string>();

  const add = (s: string) => {
    const t = s.trim().toLowerCase();
    if (t) keys.add(t);
  };

  // realm_access.roles
  const realmAccess = claims.realm_access as { roles?: unknown } | undefined;
  asStringArray(realmAccess?.roles).forEach(add);

  // resource_access[clientId].roles
  const resourceAccess = claims.resource_access as
    | Record<string, { roles?: unknown }>
    | undefined;
  if (resourceAccess && typeof resourceAccess === "object") {
    asStringArray(resourceAccess[clientId]?.roles).forEach(add);
  }

  // groups — kompletter Pfad UND letztes Segment ("/FIKNOW/Curators" → auch "curators")
  asStringArray(claims.groups).forEach((g) => {
    add(g);
    const seg = g.split("/").filter(Boolean).pop();
    if (seg) add(seg);
  });

  return [...keys];
}

const RANK: Record<Role, number> = {
  suspended: -1,
  learner: 0,
  curator: 1,
  admin: 2,
};

/**
 * Bestimmt die App-Rolle aus den Claims. `suspended` aus Keycloak wird
 * respektiert (überschreibt alles) — ein gesperrter Account bleibt gesperrt.
 */
export function mapRole(
  claims: Claims,
  clientId: string,
  roleMap: ReadonlyMap<string, Role>,
): Role {
  let best: Role = "learner";
  let sawSuspended = false;

  for (const key of extractRoleKeys(claims, clientId)) {
    const mapped = roleMap.get(key);
    if (!mapped) continue;
    if (mapped === "suspended") {
      sawSuspended = true;
      continue;
    }
    if (RANK[mapped] > RANK[best]) best = mapped;
  }

  return sawSuspended ? "suspended" : best;
}

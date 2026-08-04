/**
 * Single source of truth für gültige Land-Tokens (Scope-Dimension "Land",
 * ADR 0007). Muss byte-identisch mit dem Keycloak `country`-Claim bleiben —
 * insbesondere `LUX`, NICHT das ISO-Kürzel `LU`. Wird von Auth (OIDC-
 * Provisioning), Training-Requirements (Payload-Authoring), dem
 * Rollen-Zuweisungs-CLI und ggf. weiteren Konsumenten gemeinsam genutzt.
 */
export const LAND_TOKENS = ["DE", "CH", "LUX"] as const;

export type LandToken = (typeof LAND_TOKENS)[number];

export function isLandToken(v: string): v is LandToken {
  return (LAND_TOKENS as readonly string[]).includes(v);
}

const LAND_LABELS: Record<LandToken, string> = {
  DE: "Deutschland",
  CH: "Schweiz",
  LUX: "Luxemburg",
};

export const LAND_OPTIONS: { label: string; value: LandToken }[] =
  LAND_TOKENS.map((value) => ({ label: LAND_LABELS[value], value }));

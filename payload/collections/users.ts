import type { CollectionConfig } from "payload";

import { getAuthProvider } from "@/lib/auth/provider";

/**
 * Editor-Accounts für Payload-Admin.
 *
 * Phase 1.5 (aktuell): zwei Auth-Strategien parallel —
 *
 *   1. Standard Email+Passwort (Payload-Default, "local-jwt"):
 *      Notfall-Login + lokales Dev ohne OIDC.
 *   2. `getAuthProvider().payloadStrategy` — die OIDC-Session-Strategy
 *      ("oidc-session"): liest das ep_session-Cookie aus einer bestehenden
 *      Lerner-Session, verifiziert es serverseitig, prüft profiles.role
 *      IN ('curator','admin'), legt bei Bedarf einen Editor-Record an
 *      (Just-in-Time Provisioning, über externalId).
 *
 * Heißt: Editoren melden sich nur EINMAL über die Lerner-Login-Seite an
 * und kommen automatisch ins /admin-UI, ohne Doppel-Account.
 */
export const Users: CollectionConfig = {
  slug: "users",
  auth: {
    // Strategy kommt vom aktiven Auth-Provider: die OIDC-Session-Strategy
    // ("oidc-session", siehe lib/auth/provider/index.ts). Danach greift wie
    // gehabt Payloads Default-local-jwt als Fallback (Notfall-/Dev-Login).
    strategies: [getAuthProvider().payloadStrategy],
  },
  admin: {
    useAsTitle: "email",
    defaultColumns: ["email", "externalId", "createdAt"],
  },
  fields: [
    // 'email' wird automatisch von auth ergänzt
    {
      name: "externalId",
      type: "text",
      unique: true,
      index: true,
      admin: {
        description:
          "OIDC-sub (Keycloak). Wird beim ersten SSO-Login gesetzt. " +
          "Leer = nur lokaler Email+Passwort-Account.",
        readOnly: true,
        position: "sidebar",
      },
    },
  ],
};

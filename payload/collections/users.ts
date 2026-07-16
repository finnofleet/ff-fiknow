import type { CollectionConfig } from "payload";

import { getAuthProvider } from "@/lib/auth/provider";

/**
 * Editor-Accounts für Payload-Admin.
 *
 * Phase 1.5 (aktuell): zwei Auth-Strategien parallel —
 *
 *   1. Standard Email+Passwort (Payload-Default, "local-jwt"):
 *      Notfall-Login + lokales Dev ohne GoTrue.
 *   2. Custom GoTrue-Strategy: liest das sb-*-auth-token-Cookie aus
 *      einer bestehenden Lerner-Session, validiert das Token serverseitig
 *      gegen GoTrue (GET /auth/v1/user — kein lokales JWT-Secret nötig),
 *      prüft profiles.role IN ('curator','editor','admin'), legt bei Bedarf
 *      einen Editor-Record an (Just-in-Time Provisioning, über externalId).
 *
 * Heißt: Editoren melden sich nur EINMAL über die Lerner-Login-Seite an
 * und kommen automatisch ins /admin-UI, ohne Doppel-Account.
 */
export const Users: CollectionConfig = {
  slug: "users",
  auth: {
    // Strategy kommt vom aktiven Auth-Provider (AUTH_PROVIDER):
    // GoTrue-SSO-Bridge (Default) oder OIDC. Danach greift wie gehabt
    // Payloads Default-local-jwt als Fallback (Notfall-/Dev-Login).
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
          "GoTrue-User-ID (sub-Claim aus dem JWT). Wird beim ersten SSO-Login gesetzt. " +
          "Leer = nur lokaler Email+Passwort-Account.",
        readOnly: true,
        position: "sidebar",
      },
    },
  ],
};

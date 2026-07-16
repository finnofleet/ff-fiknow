/**
 * Auth-Provider.
 *
 * FIKNOW nutzt ausschliesslich OIDC (Keycloak) — es gibt KEINEN
 * AUTH_PROVIDER-Schalter mehr. `getAuthProvider()` bleibt als Einstiegspunkt
 * erhalten (Session-/Payload-Code ruft es), liefert aber fest den OIDC-Provider.
 */
import { createOidcProvider } from "./oidc";
import type { AuthProvider } from "./types";

export type { AuthProvider, ServerIdentity } from "./types";

let _provider: AuthProvider | null = null;

export function getAuthProvider(): AuthProvider {
  if (!_provider) _provider = createOidcProvider();
  return _provider;
}

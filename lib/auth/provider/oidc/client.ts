/**
 * OIDC-Client gegen Keycloak via oauth4webapi (Authorization-Code + PKCE).
 *
 * Sicherheits-Eckpunkte:
 *   - PKCE (S256) gegen Code-Interception.
 *   - state gegen CSRF auf den Callback (validateAuthResponse prüft es).
 *   - nonce gegen ID-Token-Replay (processAuthorizationCodeResponse erzwingt
 *     den erwarteten nonce).
 *   - Confidential Client: client_secret am Token-Endpoint (ClientSecretPost).
 *   - Die ID-Token-Signatur wird im Code-Flow bewusst NICHT nachvalidiert:
 *     der Token kommt server-to-server über TLS direkt vom Token-Endpoint mit
 *     Client-Authentifizierung (OIDC Core 3.1.3.7 — Signaturprüfung ist hier
 *     optional). iss/aud/exp/nonce werden geprüft. In Prod ist der Issuer
 *     zwingend HTTPS; nur lokal (OIDC_ALLOW_INSECURE=true) ist http erlaubt.
 */
import * as oauth from "oauth4webapi";

import { oidcConfig } from "./config";

type AS = oauth.AuthorizationServer;

const AS_TTL_SEC = 3600;
let cachedAs: { as: AS; at: number } | null = null;

function allowInsecure(): boolean {
  return process.env.OIDC_ALLOW_INSECURE === "true";
}

/** Options-Bag für Fetch-Calls (Discovery/Token) — nur lokal http erlauben. */
function httpOpts(): { [oauth.allowInsecureRequests]?: boolean } {
  return allowInsecure() ? { [oauth.allowInsecureRequests]: true } : {};
}

export async function getAuthorizationServer(): Promise<AS> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAs && now - cachedAs.at < AS_TTL_SEC) return cachedAs.as;

  const cfg = oidcConfig();
  const issuerUrl = new URL(cfg.issuer);
  const res = await oauth.discoveryRequest(issuerUrl, httpOpts());
  const as = await oauth.processDiscoveryResponse(issuerUrl, res);
  cachedAs = { as, at: now };
  return as;
}

function client(): oauth.Client {
  return { client_id: oidcConfig().clientId };
}

export type AuthStart = {
  authorizationUrl: string;
  state: string;
  nonce: string;
  codeVerifier: string;
};

/** Baut die Authorization-URL + die geheimen Transient-Werte (für den tx-Cookie). */
export async function buildAuthorizationUrl(
  redirectUri: string,
): Promise<AuthStart> {
  const cfg = oidcConfig();
  const as = await getAuthorizationServer();
  if (!as.authorization_endpoint) {
    throw new Error("OIDC: authorization_endpoint fehlt in der Discovery.");
  }

  const codeVerifier = oauth.generateRandomCodeVerifier();
  const codeChallenge = await oauth.calculatePKCECodeChallenge(codeVerifier);
  const state = oauth.generateRandomState();
  const nonce = oauth.generateRandomNonce();

  const url = new URL(as.authorization_endpoint);
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", cfg.scopes);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);

  return { authorizationUrl: url.href, state, nonce, codeVerifier };
}

export type OidcClaims = {
  sub: string;
  email: string | null;
  /** Nur true, wenn der IdP die E-Mail als verifiziert markiert. */
  emailVerified: boolean;
  name: string | null;
  /** Vollständige (validierte) ID-Token-Claims — fürs Rollen-Mapping. */
  raw: Record<string, unknown>;
};

/**
 * Validiert den Callback (state), tauscht den Code (PKCE) und validiert das
 * ID-Token (nonce/iss/aud/exp). Wirft bei jedem Fehler — der Caller behandelt
 * das als fehlgeschlagenen Login.
 */
export async function exchangeCode(args: {
  /**
   * Callback-Query-Parameter (code/state/iss/…). Bewusst URLSearchParams statt
   * URL: request.nextUrl ist eine NextURL und KEINE echte URL-Instanz —
   * oauth4webapi prüft `instanceof URL` und würde sie ablehnen.
   */
  callbackParams: URLSearchParams;
  expectedState: string;
  expectedNonce: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<OidcClaims> {
  const as = await getAuthorizationServer();
  const c = client();
  const clientAuth = oauth.ClientSecretPost(oidcConfig().clientSecret);

  // Prüft state + meldet error-Parameter aus dem Callback (wirft sonst).
  const params = oauth.validateAuthResponse(
    as,
    c,
    args.callbackParams,
    args.expectedState,
  );

  const response = await oauth.authorizationCodeGrantRequest(
    as,
    c,
    clientAuth,
    params,
    args.redirectUri,
    args.codeVerifier,
    httpOpts(),
  );

  const result = await oauth.processAuthorizationCodeResponse(as, c, response, {
    expectedNonce: args.expectedNonce,
    requireIdToken: true,
  });

  const claims = oauth.getValidatedIdTokenClaims(result);
  if (!claims?.sub) {
    throw new Error("OIDC: kein gültiger sub-Claim im ID-Token.");
  }

  const email = typeof claims.email === "string" ? claims.email : null;
  const name =
    (typeof claims.name === "string" && claims.name) ||
    (typeof claims.preferred_username === "string" &&
      claims.preferred_username) ||
    null;

  return {
    sub: claims.sub,
    email,
    emailVerified: claims.email_verified === true,
    name,
    raw: claims as Record<string, unknown>,
  };
}

/** Für RP-initiated Logout: end_session_endpoint, falls vorhanden. */
export async function getEndSessionEndpoint(): Promise<string | null> {
  const as = await getAuthorizationServer();
  return typeof as.end_session_endpoint === "string"
    ? as.end_session_endpoint
    : null;
}

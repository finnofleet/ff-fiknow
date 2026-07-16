import { NextResponse, type NextRequest } from "next/server";

import { safeNextPath } from "@/lib/auth/safe-next";
import { buildAuthorizationUrl } from "@/lib/auth/provider/oidc/client";
import { oidcConfig } from "@/lib/auth/provider/oidc/config";
import { callbackRedirectUri } from "@/lib/auth/provider/oidc/http";
import {
  cookieOptions,
  signTx,
  TX_COOKIE,
  TX_COOKIE_MAX_AGE,
} from "@/lib/auth/provider/oidc/session";

/**
 * Startet den OIDC-Login: erzeugt state/nonce/PKCE, legt sie in einem
 * kurzlebigen, signierten tx-Cookie ab und leitet zur Keycloak-Authorization-
 * URL weiter. Der validierte `next`-Pfad wird im tx-Cookie mitgeführt (nicht
 * über die — vom IdP zurückgespiegelte — URL), damit er nicht manipulierbar ist.
 */
export async function GET(request: NextRequest) {
  const cfg = oidcConfig();

  const next = safeNextPath(
    request.nextUrl.searchParams.get("next") ??
      request.nextUrl.searchParams.get("redirect") ??
      "",
  );

  const redirectUri = callbackRedirectUri(request);
  const { authorizationUrl, state, nonce, codeVerifier } =
    await buildAuthorizationUrl(redirectUri);

  const res = NextResponse.redirect(authorizationUrl);
  res.cookies.set(
    TX_COOKIE,
    await signTx({ state, nonce, codeVerifier, next }, cfg.sessionSecret),
    cookieOptions(TX_COOKIE_MAX_AGE),
  );
  return res;
}

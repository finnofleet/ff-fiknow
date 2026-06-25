import { NextResponse, type NextRequest } from "next/server";

import { exchangeCode } from "@/lib/auth/provider/oidc/client";
import { oidcConfig } from "@/lib/auth/provider/oidc/config";
import { callbackRedirectUri, publicOrigin } from "@/lib/auth/provider/oidc/http";
import {
  provisionProfile,
  resolveRole,
} from "@/lib/auth/provider/oidc";
import {
  cookieOptions,
  signSession,
  SESSION_COOKIE,
  TX_COOKIE,
  verifyTx,
} from "@/lib/auth/provider/oidc/session";

/**
 * OIDC-Callback: validiert state (CSRF), tauscht den Code (PKCE), validiert das
 * ID-Token (nonce/iss/aud/exp), mappt die Rolle aus den Keycloak-Claims,
 * provisioniert das Profil und setzt das signierte App-Session-Cookie.
 *
 * Der tx-Cookie wird in JEDEM Pfad gelöscht (Einmal-Gebrauch).
 */
export async function GET(request: NextRequest) {
  const cfg = oidcConfig();
  const origin = publicOrigin(request);

  // Fehler-Ziel ist bewusst NICHT /login: im OIDC-Modus bounct die Middleware
  // /login zurück auf die SSO-Login-Route (→ Redirect-Loop). Auf die (öffentl.)
  // Startseite mit einem Fehler-Query, der dort angezeigt werden kann.
  const fail = (reason: string, cause?: unknown) => {
    // Ursache serverseitig loggen (nicht an den Client leaken).
    console.error(`[oidc-callback] ${reason}`, cause);
    const res = NextResponse.redirect(
      new URL(`/?oidc_error=${encodeURIComponent(reason)}`, origin),
    );
    res.cookies.delete(TX_COOKIE);
    return res;
  };

  const tx = await verifyTx(
    request.cookies.get(TX_COOKIE)?.value,
    cfg.sessionSecret,
  );
  if (!tx) return fail("oidc_state_expired");

  let claims;
  try {
    claims = await exchangeCode({
      // Echte URLSearchParams (request.nextUrl ist eine NextURL, keine URL).
      callbackParams: new URLSearchParams(request.nextUrl.search),
      expectedState: tx.state,
      expectedNonce: tx.nonce,
      codeVerifier: tx.codeVerifier,
      redirectUri: callbackRedirectUri(request),
    });
  } catch (err) {
    return fail("oidc_login_failed", err);
  }

  const role = resolveRole(claims);

  try {
    await provisionProfile(claims, role);
  } catch (err) {
    return fail("oidc_provisioning_failed", err);
  }

  const session = await signSession(
    {
      sub: claims.sub,
      email: claims.email,
      emailVerified: claims.emailVerified,
      name: claims.name,
      role,
    },
    cfg.sessionSecret,
    cfg.sessionMaxAgeSec,
  );

  const res = NextResponse.redirect(new URL(tx.next || "/dashboard", origin));
  res.cookies.set(SESSION_COOKIE, session, cookieOptions(cfg.sessionMaxAgeSec));
  res.cookies.delete(TX_COOKIE);
  return res;
}

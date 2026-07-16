import { NextResponse, type NextRequest } from "next/server";

import {
  getEndSessionEndpoint,
} from "@/lib/auth/provider/oidc/client";
import { oidcConfig } from "@/lib/auth/provider/oidc/config";
import { publicOrigin } from "@/lib/auth/provider/oidc/http";
import { SESSION_COOKIE } from "@/lib/auth/provider/oidc/session";

/**
 * Logout: löscht das App-Session-Cookie und triggert — falls der IdP es
 * unterstützt — RP-initiated Logout (end_session_endpoint), damit auch die
 * Keycloak-Session beendet wird. Sonst Redirect auf die Startseite.
 *
 * POST (CSRF-ärmer, da der Logout-Button als Form gesendet werden kann).
 */
export async function POST(request: NextRequest) {
  const cfg = oidcConfig();
  const origin = publicOrigin(request);

  let target = `${origin}/`;
  const endSession = await getEndSessionEndpoint().catch(() => null);
  if (endSession) {
    const u = new URL(endSession);
    u.searchParams.set("client_id", cfg.clientId);
    u.searchParams.set("post_logout_redirect_uri", `${origin}/`);
    target = u.href;
  }

  const res = NextResponse.redirect(target);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}

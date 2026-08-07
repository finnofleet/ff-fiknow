import { NextResponse, type NextRequest } from "next/server";

import {
  getEndSessionEndpoint,
} from "@/lib/auth/provider/oidc/client";
import { oidcConfig } from "@/lib/auth/provider/oidc/config";
import { publicOrigin } from "@/lib/auth/provider/oidc/http";
import { ID_TOKEN_COOKIE, SESSION_COOKIE } from "@/lib/auth/provider/oidc/session";

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

  const idToken = request.cookies.get(ID_TOKEN_COOKIE)?.value;

  let target = `${origin}/`;
  const endSession = await getEndSessionEndpoint().catch(() => null);
  if (endSession) {
    const u = new URL(endSession);
    u.searchParams.set("client_id", cfg.clientId);
    u.searchParams.set("post_logout_redirect_uri", `${origin}/`);
    // Mit id_token_hint überspringt Keycloak die Logout-Bestätigung UND
    // respektiert post_logout_redirect_uri (Rücksprung in die App). Ohne den
    // Hint bleibt der User auf der generischen Keycloak-"logged out"-Seite.
    if (idToken) u.searchParams.set("id_token_hint", idToken);
    target = u.href;
  }

  // 303 See Other (NICHT der NextResponse-Default 307): der Logout kommt als
  // FORM-POST rein, und 307 würde die POST-Methode über den Redirect erhalten —
  // der Browser würde also an Keycloaks end_session_endpoint POSTen. Keycloak
  // liest `id_token_hint`/`post_logout_redirect_uri` dann NICHT aus dem Query
  // und zeigt statt des Rücksprungs seine generische "You are logged out"-Seite
  // (User bleibt hängen). 303 zwingt den Browser auf GET → KC respektiert die
  // Query-Parameter und leitet zurück in die App.
  const res = NextResponse.redirect(target, 303);
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.delete(ID_TOKEN_COOKIE);
  return res;
}

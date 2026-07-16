/**
 * Öffentliche Origin-Bestimmung für die OIDC-Routes.
 *
 * Die redirect_uri MUSS exakt mit der in Keycloak registrierten übereinstimmen.
 * Hinter einem Reverse-Proxy (Jelastic/IBM) ist die interne Request-Origin oft
 * nicht die öffentliche. Daher:
 *
 *   1. OIDC_REDIRECT_BASE / APP_BASE_URL  — explizit gesetzte öffentliche URL
 *      (in Prod EMPFOHLEN — eindeutig, nicht über Header spoofbar).
 *   2. x-forwarded-proto/-host            — vom vertrauenswürdigen Proxy gesetzt.
 *   3. request.nextUrl                    — letzter Fallback (lokal/Dev).
 *
 * Header sind theoretisch spoofbar; für die redirect_uri ist das aber
 * selbst-limitierend: eine gefälschte Origin matcht Keycloaks registrierte
 * redirect_uri nicht und der IdP lehnt ab. Trotzdem in Prod (1) setzen.
 */
import type { NextRequest } from "next/server";

export function publicOrigin(request: NextRequest): string {
  const base =
    process.env.OIDC_REDIRECT_BASE?.trim() || process.env.APP_BASE_URL?.trim();
  if (base) return base.replace(/\/$/, "");

  // Fail-closed in Prod: die Origin aus Request-Headern (x-forwarded-host/Host)
  // abzuleiten ist spoofbar und würde sowohl die redirect_uri als auch die
  // Browser-Redirects (Erfolg/Fehler/Logout) auf eine fremde Host steuerbar
  // machen. In Produktion daher eine explizite Basis-URL erzwingen.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "OIDC_REDIRECT_BASE (oder APP_BASE_URL) muss in Produktion gesetzt sein — " +
        "die öffentliche Origin wird nicht aus Request-Headern abgeleitet.",
    );
  }

  const h = request.headers;
  const proto =
    h.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? request.nextUrl.host;
  return `${proto}://${host}`;
}

export function callbackRedirectUri(request: NextRequest): string {
  return `${publicOrigin(request)}/auth/oidc/callback`;
}

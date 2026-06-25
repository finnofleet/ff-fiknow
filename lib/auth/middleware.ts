import { NextResponse, type NextRequest } from "next/server";

import { oidcConfig } from "@/lib/auth/provider/oidc/config";
import {
  SESSION_COOKIE,
  verifySession,
} from "@/lib/auth/provider/oidc/session";

/**
 * Request-Gate (aus dem Root-Proxy aufgerufen). FIKNOW ist OIDC-only:
 * verifiziert das signierte ep_session-Cookie (Edge-kompatibel via WebCrypto)
 * und leitet Unangemeldete zur SSO-Login-Route.
 */
const PROTECTED_PREFIXES = ["/dashboard", "/learn", "/profile"];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
}

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // /admin → /manage (Payload-Admin-UI ist abgeschaltet).
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/manage";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const session = await verifySession(
    request.cookies.get(SESSION_COOKIE)?.value,
    oidcConfig().sessionSecret,
  );

  // /login existiert nicht mehr (kein GoTrue) → direkt zur SSO-Route.
  if (pathname === "/login") {
    const url = request.nextUrl.clone();
    const next = url.searchParams.get("redirect") ?? "/dashboard";
    url.pathname = "/auth/oidc/login";
    url.search = "";
    url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }

  if (isProtectedPath(pathname) && !session) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/oidc/login";
    url.search = "";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next({ request });
}

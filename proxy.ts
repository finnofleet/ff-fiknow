import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/auth/middleware";
import {
  SESSION_COOKIE,
  verifySession,
} from "@/lib/auth/provider/oidc/session";

/**
 * Next-16-Proxy (vormals „middleware"). Zwei Zuständigkeiten:
 *
 *  1. `/api/*` — App-Session-Gate: riegelt die (von `@payloadcms/next`
 *     auto-gemountete) Payload-HTTP-API (REST `/api/[...]`, `/api/graphql`)
 *     UND die Media-Auslieferung (`/api/media/*`) hinter dem Login ab.
 *     Ohne gültige Session → 401. Gedanke: das Frontend nutzt die HTTP-API
 *     gar nicht (nur die Local API in `lib/content.ts`); anonym abrufbare
 *     published Kurse/Themen/Inhaltsverzeichnisse/Assets sind ein Leak, seit
 *     die App öffentlich im Internet steht. Der Gate hängt NUR an der
 *     App-Session (nicht an Payload) — bleibt also gültig, falls Payload je
 *     entfernt wird; dann schrumpft nur die Bypass-Liste.
 *  2. Alle übrigen Pfade (Seiten) — bestehendes `updateSession` (Session-
 *     Refresh), unverändert.
 */

/**
 * `/api`-Endpunkte, die NICHT per Session-Cookie gegatet werden:
 *  - /api/authoring/* : CLI/Plugin per Bearer-Token (Mint-Route prüft Session
 *    selbst) — kein Session-Cookie im Request.
 *  - /api/mcp/*       : MCP-Server mit eigener Auth.
 *  - /api/health*     : Deploy-/Readiness-Checks müssen anonym erreichbar sein.
 */
const API_BYPASS_PREFIXES = ["/api/authoring", "/api/mcp", "/api/health"];

function sessionSecret(): string | undefined {
  return (
    process.env.OIDC_SESSION_SECRET?.trim() ||
    process.env.PAYLOAD_SECRET?.trim() ||
    undefined
  );
}

async function gateApi(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (
    API_BYPASS_PREFIXES.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    )
  ) {
    return NextResponse.next();
  }

  const secret = sessionSecret();
  const raw = request.cookies.get(SESSION_COOKIE)?.value;
  const session = secret ? await verifySession(raw, secret) : null;

  if (!session) {
    return new NextResponse("Unauthorized", {
      status: 401,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  return NextResponse.next();
}

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return gateApi(request);
  }
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Seiten: alle Pfade ausser
     * - _next/static / _next/image (Build-Assets)
     * - favicon.ico
     * - .svg / .png / .jpg / .webp (statische Bilder)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    /*
     * API IMMER matchen — inkl. Media-Dateien mit Bild-Endung
     * (`/api/media/file/x.png`), die das Seiten-Pattern oben ausschliesst.
     */
    "/api/:path*",
  ],
};

/**
 * GET /version
 *
 * Öffentlicher Diagnose-Endpoint: gibt in Sekunden Auskunft, welcher
 * Build/Commit gerade läuft (siehe lib/app-version.ts). Bewusst NICHT unter
 * `/api/*` — der Root-Proxy (proxy.ts) riegelt `/api/*` per Session-Cookie
 * ab (Payload-HTTP-API-Gate); `/version` soll aber ohne Login abrufbar sein,
 * genau wie `/api/health`. Enthält keine Geheimnisse, nur Versions-Metadaten.
 */
import { NextResponse } from "next/server";

import { getAppVersion } from "@/lib/app-version";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(getAppVersion(), {
    headers: { "cache-control": "no-store" },
  });
}

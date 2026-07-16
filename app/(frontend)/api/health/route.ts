/**
 * GET /api/health
 *
 * Leichtgewichtiger Health-/Version-Endpoint. Gibt den beim Build injizierten
 * Git-SHA zurück (next.config.ts → env.BUILD_SHA) — damit ist nach jedem
 * Deploy mit EINEM curl klar, welcher Commit wirklich läuft. Öffentlich,
 * verrät nur SHA + Uptime, keine Geheimnisse.
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      ok: true,
      sha: process.env.BUILD_SHA ?? "unknown",
      uptimeSeconds: Math.round(process.uptime()),
      time: new Date().toISOString(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}

/**
 * GET /api/health/ready  — Readiness-Probe.
 *
 * Im Gegensatz zu /api/health (Liveness: "Prozess lebt") spiegelt Readiness
 * die Verfügbarkeit kritischer Abhängigkeiten wider. Hier: ein echtes
 * `SELECT 1` gegen Postgres. Solange die DB nicht erreichbar ist, liefert der
 * Endpoint HTTP 503 → Kubernetes nimmt den Pod aus dem Service-Endpoint, statt
 * Requests in 500er laufen zu lassen.
 *
 * Öffentlich, gibt keine Geheimnisse preis (nur ok/Fehlerklasse).
 */
import { NextResponse } from "next/server";

import { pingDb } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await pingDb();
    return NextResponse.json(
      { ok: true, db: "up" },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    console.error("[health/ready] DB-Check fehlgeschlagen:", err);
    return NextResponse.json(
      { ok: false, db: "down" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}

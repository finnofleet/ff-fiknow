/**
 * GET /api/debug/last-errors?key=<DEBUG_ERROR_KEY>
 *
 * Liest die letzten vom `onRequestError`-Hook (instrumentation.ts) erfassten
 * Server-Fehler inkl. Stacktrace aus dem In-Memory-Sink. Diagnose-Werkzeug,
 * damit 500er OHNE Container-Log-Zugriff debugbar sind.
 *
 * Sicherheit:
 *   - Komplett DEAKTIVIERT, solange `DEBUG_ERROR_KEY` nicht gesetzt ist → 404.
 *   - Ist es gesetzt, muss der Request `?key=` (oder Header `x-debug-key`)
 *     exakt matchen, sonst 404 (kein 401 — wir geben die Existenz nicht preis).
 *   - Stacktraces können interne Pfade leaken → Key zwingend, Endpoint nach
 *     dem Debuggen via Entfernen der Env-Var wieder abschalten.
 */
import { NextResponse, type NextRequest } from "next/server";

import { getRecordedErrors } from "@/lib/debug/error-sink";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  const expected = process.env.DEBUG_ERROR_KEY;
  if (!expected) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const provided =
    request.nextUrl.searchParams.get("key") ??
    request.headers.get("x-debug-key");
  if (provided !== expected) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const errors = getRecordedErrors();
  return NextResponse.json(
    { ok: true, sha: process.env.BUILD_SHA ?? "unknown", count: errors.length, errors },
    { headers: { "cache-control": "no-store" } },
  );
}

/**
 * CSV-Audit-Export für Pflichtkurse (ADR 0005 §6, Phase 6d — „entparkte"
 * Phase 5).
 *
 *   GET /manage/pflichtkurse/export[?driver=<wert>]
 *
 * Gleiches Access-Gate wie das Dashboard (`app/.../pflichtkurse/page.tsx`,
 * Capability `compliance:export` via `resolveEffectiveCapabilities`),
 * dieselbe Compliance-Query (`getComplianceOverview`)
 * und derselbe `?driver=`-Filter wie die Dashboard-Seite — kein
 * Parallel-Datenpfad. Eine Zeile pro Teilnehmer × Kurs (Audit-Detailtiefe),
 * RFC-4180-Escaping + UTF-8-BOM (Excel-Umlaute) via `compliance-csv.ts`.
 *
 * Auth-Antwortformat (401/403 JSON) analog `api/authoring/tokens/route.ts` —
 * dies ist ein Daten-Endpoint, keine Seite, daher kein `redirect()` wie im
 * Dashboard, sondern der im Repo übliche JSON-Error für API-Routen.
 */
import { NextResponse, type NextRequest } from "next/server";

import { complianceAuditEnabled, recordAudit } from "@/lib/audit/log";
import { can } from "@/lib/auth/capabilities";
import { resolveEffectiveCapabilities } from "@/lib/auth/effective-capabilities";
import { getCurrentUser } from "@/lib/auth/session";
import { getComplianceOverview } from "@/lib/training/compliance";
import { filterCoursesByDriver } from "@/lib/training/compliance-compute";
import { buildComplianceCsv } from "@/lib/training/compliance-csv";
import { resolveViewerScope } from "@/lib/training/viewer-scope";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError(401, "not_logged_in");
  const caps = await resolveEffectiveCapabilities(user.id, user.role, user.roleKeys);
  if (!can(caps, "compliance:export")) {
    return jsonError(403, "insufficient_capability", {
      required: "compliance:export",
    });
  }

  const driver = request.nextUrl.searchParams.get("driver");

  // Scope der EIGENEN Capability aufloesen, nicht den von
  // `compliance:view-named`. `compliance:export` steht in
  // `SCOPED_CAPABILITIES` (lib/auth/capabilities.ts) — die Achse gilt also
  // auch hier. Vorher wurde hier der view-named-Scope aufgeloest, was
  // fail-OPEN war: `resolveViewerScope` liefert bei null Treffern
  // `unrestricted`, also haette eine auf EINE Gesellschaft gescopte Rolle,
  // die nur `compliance:export` traegt (und kein `view-named`), den CSV ueber
  // ALLE Gesellschaften gezogen — genau in der Richtung, die das Scoping
  // verhindern soll. Solange niemand gescopte Rollen haelt, ist das Ergebnis
  // identisch; scharf wird es mit der ersten gescopten Zuweisung.
  const viewerScope = await resolveViewerScope(user.id, "compliance:export");
  const overview = await getComplianceOverview({ viewerScope });
  const filtered = filterCoursesByDriver(overview, driver);
  const csv = buildComplianceCsv(filtered);

  // ADR 0007 P4b: CSV-Export protokollieren — NUR wenn per Flag freigegeben
  // (BR-Mitbestimmung, §11). Best-effort.
  if (complianceAuditEnabled()) {
    await recordAudit({
      action: "compliance.export",
      actorUserId: user.id,
      actorRole: user.role,
      source: "session",
      targetType: "compliance",
      targetId: driver,
    });
  }

  const dateStamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pflichtkurse-nachweis-${dateStamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

function jsonError(
  status: number,
  code: string,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json(
    { ok: false, error: code, ...(extra ?? {}) },
    { status },
  );
}

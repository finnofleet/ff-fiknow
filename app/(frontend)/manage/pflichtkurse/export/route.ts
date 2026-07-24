/**
 * CSV-Audit-Export für Pflichtkurse (ADR 0005 §6, Phase 6d — „entparkte"
 * Phase 5).
 *
 *   GET /manage/pflichtkurse/export[?driver=<wert>]
 *
 * Gleiches Access-Gate wie das Dashboard (`app/.../pflichtkurse/page.tsx`,
 * `canManageCourses`), dieselbe Compliance-Query (`getComplianceOverview`)
 * und derselbe `?driver=`-Filter wie die Dashboard-Seite — kein
 * Parallel-Datenpfad. Eine Zeile pro Teilnehmer × Kurs (Audit-Detailtiefe),
 * RFC-4180-Escaping + UTF-8-BOM (Excel-Umlaute) via `compliance-csv.ts`.
 *
 * Auth-Antwortformat (401/403 JSON) analog `api/authoring/tokens/route.ts` —
 * dies ist ein Daten-Endpoint, keine Seite, daher kein `redirect()` wie im
 * Dashboard, sondern der im Repo übliche JSON-Error für API-Routen.
 */
import { NextResponse, type NextRequest } from "next/server";

import { canManageCourses } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { getComplianceOverview } from "@/lib/training/compliance";
import { filterCoursesByDriver } from "@/lib/training/compliance-compute";
import { buildComplianceCsv } from "@/lib/training/compliance-csv";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError(401, "not_logged_in");
  if (!canManageCourses(user.role)) {
    return jsonError(403, "insufficient_role", {
      required: ["curator", "admin"],
      got: user.role,
    });
  }

  const driver = request.nextUrl.searchParams.get("driver");

  const overview = await getComplianceOverview();
  const filtered = filterCoursesByDriver(overview, driver);
  const csv = buildComplianceCsv(filtered);

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

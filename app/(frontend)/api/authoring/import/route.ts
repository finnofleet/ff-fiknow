/**
 * Course-Bundle-Upload-Endpoint.
 *
 *   POST /api/authoring/import
 *     Auth:    GoTrue-Session-Cookie (Editor- oder Admin-Rolle)
 *     Body:    multipart/form-data
 *                bundle      File (ZIP)   — Pflicht
 *                courseSlug  string       — Pflicht
 *
 *   Response 200:
 *     { ok: true, summary: ImportSummary }
 *
 *   Response 401: nicht eingeloggt
 *   Response 403: eingeloggt aber User ist nicht Editor/Admin
 *   Response 400: kaputtes Form-Payload / kein gültiges ZIP / Schema-Fehler
 *   Response 413: Bundle grösser als MAX_BUNDLE_BYTES
 *   Response 500: Server-Fehler
 *
 * Auth-Modell:
 *   - Browser-Upload via Admin-Console (/admin/import) nutzt Session-Cookie
 *   - Plugin macht lokal ZIP; User uploaded selbst im Browser
 *   - Token-Auth (für späteren MCP-Server-Use-Case) ist parkiert, siehe
 *     ~/.claude/projects/...memory/tech_sketch_token_auth_for_mcp.md
 *
 * Bundle-Verarbeitung:
 *   - ZIP wird in-memory entpackt (adm-zip, sync — kleine Bundles)
 *   - Files-Map an importFromExtractedBundle() übergeben
 *   - Keine temporären Files auf der Disk
 */
import { NextResponse, type NextRequest } from "next/server";

import { authenticateAuthoring } from "@/lib/auth/authoring-auth";
import { verifyBundleUploadToken } from "@/lib/authoring/asset-upload-token";
import { VersionConflictError } from "@/lib/authoring/errors";
import { importFromExtractedBundle } from "@/lib/authoring/import";
import { extractZipToMap } from "@/lib/authoring/zip";
import { rateLimit } from "@/lib/rate-limit";

const MAX_BUNDLE_BYTES = 100 * 1024 * 1024; // 100 MB Hard-Limit (komprimiert)

// Import ist der schwerste Authoring-Pfad (ZIP-Extract + Asset-Processing +
// DB-Writes) → striktes Limit (SECURITY_AUDIT Finding 11).
const IMPORT_RATE_LIMIT = 10;
const IMPORT_RATE_WINDOW_MS = 60_000;

export async function POST(request: NextRequest) {
  // 1. Auth — ENTWEDER presigned Bundle-Upload-Token (aus
  // request_bundle_upload_url, auf genau diesen courseSlug gescoped) ODER der
  // reguläre cat_-Bearer / die Session. Das Token ist der Out-of-Band-Pfad für
  // Shell-Clients (local-agent-mode/CLI): Bundle lokal zippen + per curl POSTen,
  // ohne den MDX-Text durch den Modell-Kontext zu schleusen.
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  let principalId: string;
  let tokenCourseSlug: string | null = null;
  if (token) {
    const qSlug = searchParams.get("courseSlug") ?? "";
    if (!/^[a-z0-9-]+$/.test(qSlug)) {
      return jsonError(400, "invalid_course_slug", { courseSlug: qSlug });
    }
    const v = verifyBundleUploadToken(token, qSlug);
    if (!v.ok) return jsonError(401, "invalid_upload_token", { reason: v.reason });
    principalId = `bundle-token:${qSlug}`;
    tokenCourseSlug = qSlug;
  } else {
    const auth = await authenticateAuthoring(request);
    if (!auth.ok) return jsonError(auth.status, auth.error, auth.extra);
    principalId = auth.principal.id;
  }

  // 2. Rate-Limit (pro Principal)
  const limit = rateLimit(
    `import:${principalId}`,
    IMPORT_RATE_LIMIT,
    IMPORT_RATE_WINDOW_MS,
  );
  if (!limit.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "rate_limited",
        limit: limit.limit,
        retry_after_sec: limit.retryAfterSec,
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  // 3. Multipart-Form parsen
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError(400, "invalid_multipart_form");
  }

  // courseSlug: beim Token-Pfad autoritativ aus dem signierten Query-Scope,
  // sonst aus dem Form-Feld.
  let courseSlug: string;
  if (tokenCourseSlug) {
    courseSlug = tokenCourseSlug;
  } else {
    const fromForm = formData.get("courseSlug");
    if (typeof fromForm !== "string" || fromForm.length === 0) {
      return jsonError(400, "missing_course_slug");
    }
    if (!/^[a-z0-9-]+$/.test(fromForm)) {
      return jsonError(400, "invalid_course_slug", { courseSlug: fromForm });
    }
    courseSlug = fromForm;
  }

  const bundleField = formData.get("bundle");
  if (!(bundleField instanceof Blob)) {
    return jsonError(400, "missing_bundle_field");
  }
  if (bundleField.size === 0) {
    return jsonError(400, "empty_bundle");
  }
  if (bundleField.size > MAX_BUNDLE_BYTES) {
    return jsonError(413, "bundle_too_large", {
      max_bytes: MAX_BUNDLE_BYTES,
      got_bytes: bundleField.size,
    });
  }

  // 4. ZIP entpacken in eine Files-Map
  let files: Map<string, Buffer>;
  try {
    const arrayBuffer = await bundleField.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    files = extractZipToMap(buffer);
  } catch (err) {
    return jsonError(400, "zip_extraction_failed", {
      detail: (err as Error).message,
    });
  }

  if (files.size === 0) {
    return jsonError(400, "zip_empty_or_no_files");
  }

  // 5. Import via geteiltem Helper
  try {
    const summary = await importFromExtractedBundle(courseSlug, files);
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    // Optimistic-Locking-Konflikt → 409 mit strukturiertem Diff-Hinweis.
    if (err instanceof VersionConflictError) {
      return jsonError(409, "version_conflict", {
        courseSlug: err.courseSlug,
        expected: err.expected,
        current: err.current,
        detail: err.message,
      });
    }
    const message = (err as Error).message;
    // Bundle-Parser-Fehler sind User-Errors → 400
    if (
      message.includes("Bundle-Parser:") ||
      message.includes("course.mdx fehlt") ||
      message.includes("Ungültiger Slug") ||
      message.includes("MDX-Validierung:") ||
      message.includes("Asset-Validierung:")
    ) {
      return jsonError(400, "bundle_validation_failed", { detail: message });
    }
    console.error("[/api/authoring/import] unexpected:", err);
    return jsonError(500, "import_failed", { detail: message });
  }
}

// ============================================================
// Helpers
// ============================================================

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

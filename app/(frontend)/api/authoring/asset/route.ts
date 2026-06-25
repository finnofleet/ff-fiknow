/**
 * Direkter Binär-Asset-Upload (ADR 0004 — out-of-band Asset-Transfer).
 *
 *   POST /api/authoring/asset?courseSlug=<slug>&path=<assets/...>[&token=<presigned>]
 *     Auth:    presigned `token` (aus request_asset_upload_url, self-authenticating,
 *              auf genau courseSlug+path gescoped) ODER Authorization: Bearer cat_…
 *              (curator/admin) ODER Session
 *     Body:    rohe Asset-Bytes (application/octet-stream)
 *
 *   Response 200: { ok: true, path, sha256, bytes, contentType }
 *   Response 400: ungültiger Pfad/Typ, leere/zu große Bytes
 *   Response 401/403: Auth
 *   Response 413: Body über dem Asset-Limit
 *   Response 429: Rate-Limit
 *
 * Warum getrennt vom MCP-Tool `upload_asset`: dort kommen die Bytes als
 * base64-STRING im Tool-Argument — das Modell muss sie also als Token
 * ausgeben, was selbst für kleine Bilder teuer und langsam ist. Clients mit
 * Shell-Zugriff (local-agent-mode, CLI) laden hier stattdessen DIREKT hoch,
 * ohne dass die Bytes je den Modell-Kontext durchlaufen:
 *
 *   curl -X POST "$HOST/api/authoring/asset?courseSlug=foo&path=assets/images/cover.jpg" \
 *     -H "Authorization: Bearer cat_…" \
 *     -H "Content-Type: application/octet-stream" \
 *     --data-binary @cover.jpg
 *
 * Der zurückgegebene `sha256` wird danach im import_course als
 * `{ path, sha256 }` referenziert — exakt wie ein per upload_asset gestagtes
 * Asset (beide nutzen denselben Staging-Store + dieselbe Härtung).
 */
import { NextResponse, type NextRequest } from "next/server";

import { authenticateAuthoring } from "@/lib/auth/authoring-auth";
import { MAX_STAGED_ASSET_BYTES } from "@/lib/authoring/asset-staging";
import { verifyUploadToken } from "@/lib/authoring/asset-upload-token";
import {
  AssetUploadError,
  validateAndStageAsset,
} from "@/lib/authoring/asset-upload";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Gleiche Klasse wie der Import-Pfad: ein einzelner Asset-Upload ist deutlich
// leichter als ein ganzes Bundle, aber wir deckeln pro User trotzdem.
const ASSET_RATE_LIMIT = 60;
const ASSET_RATE_WINDOW_MS = 60_000;

export async function POST(request: NextRequest) {
  // 1. Parameter (vor Auth: das Token ist auf genau courseSlug+path gescoped).
  const { searchParams } = new URL(request.url);
  const courseSlug = searchParams.get("courseSlug") ?? "";
  const path = searchParams.get("path") ?? "";
  const token = searchParams.get("token");
  if (!/^[a-z0-9-]+$/.test(courseSlug)) {
    return jsonError(400, "invalid_course_slug", { courseSlug });
  }
  if (!path) {
    return jsonError(400, "missing_path");
  }

  // 2. Auth — ENTWEDER presigned Upload-Token (aus request_asset_upload_url,
  // self-authenticating, auf genau dieses Asset gescoped) ODER der reguläre
  // cat_-Bearer / die Session. Das Token ist der Pfad für Shell-Clients ohne
  // Zugriff auf das cat_-Token.
  let principalId: string;
  if (token) {
    const v = verifyUploadToken(token, courseSlug, path);
    if (!v.ok) return jsonError(401, "invalid_upload_token", { reason: v.reason });
    principalId = `token:${courseSlug}`;
  } else {
    const auth = await authenticateAuthoring(request);
    if (!auth.ok) return jsonError(auth.status, auth.error, auth.extra);
    principalId = auth.principal.id;
  }

  // 3. Rate-Limit (pro Principal)
  const limit = rateLimit(
    `asset:${principalId}`,
    ASSET_RATE_LIMIT,
    ASSET_RATE_WINDOW_MS,
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

  // 4. Rohe Bytes lesen (Body = das Asset selbst)
  let bytes: Buffer;
  try {
    bytes = Buffer.from(await request.arrayBuffer());
  } catch {
    return jsonError(400, "invalid_body");
  }
  // Früh-Cap, bevor wir die Bytes weiterreichen (der Helper prüft nochmals).
  if (bytes.length > MAX_STAGED_ASSET_BYTES) {
    return jsonError(413, "asset_too_large", {
      max_bytes: MAX_STAGED_ASSET_BYTES,
      got_bytes: bytes.length,
    });
  }

  // 5. Validieren + stagen (geteilt mit dem MCP-Tool upload_asset)
  try {
    const contentType =
      request.headers.get("content-type")?.split(";")[0]?.trim() || undefined;
    const staged = await validateAndStageAsset({
      courseSlug,
      path,
      bytes,
      // octet-stream ist der curl-Default für --data-binary → nicht als
      // Type-Hint missdeuten; nur einen echten Bild-MIME durchreichen.
      contentType:
        contentType && contentType !== "application/octet-stream"
          ? contentType
          : undefined,
    });
    return NextResponse.json({ ok: true, ...staged });
  } catch (err) {
    if (err instanceof AssetUploadError) {
      return jsonError(400, "asset_validation_failed", { detail: err.message });
    }
    console.error("[/api/authoring/asset] unexpected:", err);
    return jsonError(500, "asset_upload_failed", {
      detail: (err as Error).message,
    });
  }
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

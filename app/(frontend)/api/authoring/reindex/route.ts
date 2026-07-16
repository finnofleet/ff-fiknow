/**
 * RAG-Re-Index-Endpoint (ADR 0003).
 *
 *   POST /api/authoring/reindex
 *     Auth:  Bearer-Authoring-Token oder Session (curator/admin)
 *     Body:  { slug?: string }
 *              - slug gesetzt → genau diesen Kurs neu indexieren
 *              - slug fehlt    → Backfill: ALLE Kurse neu indexieren
 *
 *   Response 200:
 *     { ok: true, results: [{ courseSlug, status, chunkCount, reason? }],
 *       summary: { indexed, needs_reindex, totalChunks } }
 *
 *   Response 401/403: Auth
 *   Response 400: invalid_json
 *   Response 404: course_not_found (nur bei gesetztem slug)
 *   Response 503: embedding_not_configured (kein VOYAGE_API_KEY)
 *
 * Holt nach, was der best-effort-Upload-Hook ausgelassen hat (needs_reindex),
 * oder re-embeddet nach einem Modell-/Inhalts-Wechsel.
 */
import { NextResponse, type NextRequest } from "next/server";

import { authenticateAuthoring } from "@/lib/auth/authoring-auth";
import { isEmbeddingConfigured } from "@/lib/embeddings";
import {
  type ReindexCourseResult,
  reindexAllCourses,
  reindexCourse,
} from "@/lib/rag/reindex";
import { rateLimit } from "@/lib/rate-limit";

// Re-Indexing ist teuer (Embedding-Calls über ggf. viele Chunks) → enger Cap.
const REINDEX_RATE_LIMIT = 6;
const REINDEX_RATE_WINDOW_MS = 60_000;

export async function POST(request: NextRequest) {
  // 1. Auth — Bearer-Token oder Session (curator/admin)
  const auth = await authenticateAuthoring(request);
  if (!auth.ok) return jsonError(auth.status, auth.error, auth.extra);
  const user = auth.principal;

  // 2. Rate-Limit (pro User)
  const rl = rateLimit(
    `reindex:${user.id}`,
    REINDEX_RATE_LIMIT,
    REINDEX_RATE_WINDOW_MS,
  );
  if (!rl.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "rate_limited",
        limit: rl.limit,
        retry_after_sec: rl.retryAfterSec,
      },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  // 3. Ohne Embedding-Key ist Re-Indexing sinnlos → klares 503.
  if (!isEmbeddingConfigured()) {
    return jsonError(503, "embedding_not_configured");
  }

  // 4. Body parsen
  let body: { slug?: unknown };
  try {
    body = (await request.json().catch(() => ({}))) as typeof body;
  } catch {
    return jsonError(400, "invalid_json");
  }
  const slug =
    typeof body.slug === "string" && body.slug.trim() ? body.slug.trim() : null;

  // 5. Re-Index (ein Kurs) oder Backfill (alle)
  let results: ReindexCourseResult[];
  try {
    results = slug
      ? [await reindexCourse(slug)]
      : await reindexAllCourses();
  } catch (err) {
    const message = (err as Error).message;
    if (slug && message.includes("nicht gefunden")) {
      return jsonError(404, "course_not_found", { slug });
    }
    return jsonError(500, "reindex_failed", { message });
  }

  const summary = {
    indexed: results.filter((r) => r.status === "indexed").length,
    needs_reindex: results.filter((r) => r.status === "needs_reindex").length,
    totalChunks: results.reduce((sum, r) => sum + r.chunkCount, 0),
  };

  return NextResponse.json({ ok: true, results, summary });
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

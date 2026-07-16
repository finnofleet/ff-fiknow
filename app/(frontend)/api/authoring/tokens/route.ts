/**
 * Verwaltung der Scoped Authoring-Tokens (ADR 0001, Sicherheits-Anforderung 5).
 *
 *   POST /api/authoring/tokens   — neuen Token erzeugen (Klartext EINMALIG)
 *   GET  /api/authoring/tokens   — eigene Tokens listen (ohne Klartext/Hash)
 *
 * Auth: **nur Session-Cookie** (curator/admin) — bewusst NICHT der Bearer-
 * Token-Helper. Ein Token darf sich nicht selbst nachgenerieren (würde die
 * kurze TTL aushebeln). Tokens kann nur ein im Browser eingeloggter Mensch
 * minten/widerrufen.
 */
import { NextResponse, type NextRequest } from "next/server";

import { canManageCourses } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import {
  mintAuthoringToken,
  listAuthoringTokens,
  MAX_TTL_HOURS,
} from "@/lib/auth/authoring-token";
import { rateLimit } from "@/lib/rate-limit";

const MINT_RATE_LIMIT = 10;
const MINT_RATE_WINDOW_MS = 60_000;
const MAX_LABEL_LEN = 200;

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError(401, "not_logged_in");
  if (!canManageCourses(user.role)) {
    return jsonError(403, "insufficient_role", {
      required: ["curator", "admin"],
      got: user.role,
    });
  }

  const rl = rateLimit(`mint-token:${user.id}`, MINT_RATE_LIMIT, MINT_RATE_WINDOW_MS);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited", limit: rl.limit, retry_after_sec: rl.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  let body: { label?: unknown; ttlHours?: unknown } = {};
  try {
    // Body ist optional — leerer/kaputter Body ⇒ Defaults.
    const text = await request.text();
    if (text) body = JSON.parse(text) as typeof body;
  } catch {
    return jsonError(400, "invalid_json");
  }

  let label: string | null = null;
  if (body.label != null) {
    if (typeof body.label !== "string" || body.label.length > MAX_LABEL_LEN) {
      return jsonError(400, "invalid_label", { max_length: MAX_LABEL_LEN });
    }
    label = body.label;
  }

  let ttlHours: number | undefined;
  if (body.ttlHours != null) {
    if (typeof body.ttlHours !== "number" || body.ttlHours <= 0) {
      return jsonError(400, "invalid_ttl", { max_hours: MAX_TTL_HOURS });
    }
    ttlHours = body.ttlHours;
  }

  const minted = await mintAuthoringToken({ userId: user.id, label, ttlHours });
  return NextResponse.json({
    ok: true,
    id: minted.id,
    token: minted.token, // EINMALIG — danach nur noch der Hash in der DB
    expiresAt: minted.expiresAt.toISOString(),
    ttlHours: minted.ttlHours,
  });
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError(401, "not_logged_in");
  if (!canManageCourses(user.role)) {
    return jsonError(403, "insufficient_role", {
      required: ["curator", "admin"],
      got: user.role,
    });
  }

  const tokens = await listAuthoringTokens(user.id);
  return NextResponse.json({
    ok: true,
    tokens: tokens.map((t) => ({
      id: t.id,
      label: t.label,
      createdAt: t.createdAt.toISOString(),
      expiresAt: t.expiresAt.toISOString(),
      lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
      revoked: t.revoked,
      expired: t.expired,
    })),
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

/**
 * Annotations-Endpoint (ADR 0002, Slice 1+2).
 *
 *   GET  /api/annotations?courseSlug&sectionSlug&lessonSlug
 *        → { ok, annotations: AnnotationDTO[] }  (nur die eigenen)
 *   POST /api/annotations
 *        Body: { courseSlug, sectionSlug, lessonSlug, type, ...anchor, color?, body?, bundleVersion? }
 *        → { ok, annotation }
 *   DELETE /api/annotations?id=<uuid>
 *        → { ok }
 *
 * Funktioniert OHNE LLM (Markierungen/Notizen sind lokal, gratis, privat) —
 * die `tutor_explanation`-Annotation ist nur ein weiterer Typ auf derselben
 * Schicht. RLS + serverseitiges user_id-Scoping (lib/annotations.ts) stellen
 * sicher, dass jeder nur seine eigenen liest/schreibt/löscht.
 */
import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { canLearn } from "@/lib/auth/roles";
import {
  createAnnotation,
  deleteAnnotation,
  isAnnotationType,
  listAnnotationsForLesson,
  MAX_BODY_CHARS,
  MAX_ANCHOR_CHARS,
} from "@/lib/annotations";
import { rateLimit } from "@/lib/rate-limit";

const WRITE_RATE_LIMIT = 120;
const WRITE_RATE_WINDOW_MS = 60_000;

export async function GET(request: NextRequest) {
  const user = await requireLearner();
  if (!user) return jsonError(401, "unauthorized");

  const sp = request.nextUrl.searchParams;
  const ref = lessonRefFrom(
    sp.get("courseSlug"),
    sp.get("sectionSlug"),
    sp.get("lessonSlug"),
  );
  if (!ref) return jsonError(400, "invalid_lesson_ref");

  const annotations = await listAnnotationsForLesson(user.id, ref);
  return NextResponse.json({ ok: true, annotations });
}

export async function POST(request: NextRequest) {
  const user = await requireLearner();
  if (!user) return jsonError(401, "unauthorized");

  const rl = rateLimit(
    `annotations:write:${user.id}`,
    WRITE_RATE_LIMIT,
    WRITE_RATE_WINDOW_MS,
  );
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited", retry_after_sec: rl.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError(400, "invalid_json");
  }

  const ref = lessonRefFrom(
    body.courseSlug,
    body.sectionSlug,
    body.lessonSlug,
  );
  if (!ref) return jsonError(400, "invalid_lesson_ref");

  if (!isAnnotationType(body.type)) return jsonError(400, "invalid_type");

  // Längen kappen (Memory-/Kosten-Hygiene, untrusted Input).
  const annotation = await createAnnotation({
    userId: user.id,
    ...ref,
    type: body.type,
    bundleVersion: asStr(body.bundleVersion, 200),
    anchorQuote: asStr(body.anchorQuote, MAX_ANCHOR_CHARS),
    anchorPrefix: asStr(body.anchorPrefix, MAX_ANCHOR_CHARS),
    anchorSuffix: asStr(body.anchorSuffix, MAX_ANCHOR_CHARS),
    anchorStart: asInt(body.anchorStart),
    anchorEnd: asInt(body.anchorEnd),
    color: asStr(body.color, 32),
    body: asStr(body.body, MAX_BODY_CHARS),
  });

  return NextResponse.json({ ok: true, annotation }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const user = await requireLearner();
  if (!user) return jsonError(401, "unauthorized");

  const id = request.nextUrl.searchParams.get("id");
  if (!id || !isUuid(id)) return jsonError(400, "invalid_id");

  const ok = await deleteAnnotation(user.id, id);
  if (!ok) return jsonError(404, "not_found");
  return NextResponse.json({ ok: true });
}

// ---- Helpers -------------------------------------------------------------

async function requireLearner() {
  const user = await getCurrentUser();
  if (!user || !canLearn(user.role)) return null;
  return user;
}

function lessonRefFrom(
  course: unknown,
  section: unknown,
  lesson: unknown,
): { courseSlug: string; sectionSlug: string; lessonSlug: string } | null {
  const c = asSlug(course);
  const s = asSlug(section);
  const l = asSlug(lesson);
  if (!c || !s || !l) return null;
  return { courseSlug: c, sectionSlug: s, lessonSlug: l };
}

function asSlug(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return /^[a-z0-9][a-z0-9-]{0,127}$/.test(v) ? v : null;
}

function asStr(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;
  return v.length > max ? v.slice(0, max) : v;
}

function asInt(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    v,
  );
}

function jsonError(status: number, code: string): NextResponse {
  return NextResponse.json({ ok: false, error: code }, { status });
}

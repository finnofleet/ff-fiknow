/**
 * Course-Publish-Endpoint.
 *
 *   POST /api/authoring/publish
 *     Auth:  GoTrue-Session-Cookie (Editor- oder Admin-Rolle)
 *     Body:  { courseId: number, includeChildren?: boolean }
 *
 *   Response 200:
 *     { ok: true, course: { id, slug, status }, children?: { sections, lessons } }
 *
 *   Response 401: nicht eingeloggt
 *   Response 403: keine Editor/Admin-Rolle
 *   Response 400: courseId fehlt oder ungültig
 *   Response 404: Course existiert nicht
 *   Response 500: Server-Fehler
 *
 * Schaltet einen Course (und optional alle seine Sections + Lessons) von
 * `_status: "draft"` auf `_status: "published"`. Default-Verhalten:
 * includeChildren=true — sonst wäre der Course zwar published aber
 * Sections/Lessons noch draft und auf der Frontend-Page unsichtbar.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";

import payloadConfig from "@/payload.config";
import { authenticateAuthoring } from "@/lib/auth/authoring-auth";
import { publishCourseCascade } from "@/lib/authoring/lifecycle";
import { rateLimit } from "@/lib/rate-limit";

// SECURITY_AUDIT Finding 11 — Frequenz-Cap auf den Publish-Pfad (DB-Updates).
const PUBLISH_RATE_LIMIT = 20;
const PUBLISH_RATE_WINDOW_MS = 60_000;

export async function POST(request: NextRequest) {
  // 1. Auth — Bearer-Token oder Session (curator/admin)
  const auth = await authenticateAuthoring(request);
  if (!auth.ok) return jsonError(auth.status, auth.error, auth.extra);
  const user = auth.principal;

  // 2. Rate-Limit (pro User)
  const rl = rateLimit(
    `publish:${user.id}`,
    PUBLISH_RATE_LIMIT,
    PUBLISH_RATE_WINDOW_MS,
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

  // 3. Body parsen
  let body: { courseId?: unknown; includeChildren?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError(400, "invalid_json");
  }
  const courseId = Number(body.courseId);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return jsonError(400, "invalid_course_id", { got: body.courseId });
  }
  const includeChildren = body.includeChildren !== false; // Default true

  // 4. Course existiert?
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload = (await getPayload({ config: payloadConfig })) as any;
  let course;
  try {
    course = await payload.findByID({
      collection: "courses",
      id: courseId,
      draft: true, // wir wollen auch Drafts finden
      overrideAccess: true,
    });
  } catch {
    return jsonError(404, "course_not_found", { courseId });
  }
  if (!course) return jsonError(404, "course_not_found", { courseId });

  // 5. Course (+ optional Sections/Lessons) publishen — geteilte Lifecycle-
  //    Logik (dieselbe Funktion nutzt /manage/courses → genau EINE Publish-
  //    Wahrheit, kein Drift zwischen CLI-Pfad und Manage-UI).
  const children = await publishCourseCascade(courseId, includeChildren);

  return NextResponse.json({
    ok: true,
    course: {
      id: course.id,
      slug: course.slug,
      status: "published",
    },
    children: includeChildren ? children : undefined,
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

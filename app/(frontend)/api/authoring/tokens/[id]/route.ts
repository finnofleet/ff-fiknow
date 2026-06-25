/**
 * Widerruf eines Scoped Authoring-Tokens.
 *
 *   DELETE /api/authoring/tokens/<id>
 *
 * Auth: nur Session-Cookie (curator/admin). Man kann nur EIGENE Tokens
 * widerrufen (revokeAuthoringToken filtert auf user_id). Idempotent: ein
 * bereits widerrufener/fremder/unbekannter Token → 404.
 */
import { NextResponse } from "next/server";

import { canManageCourses } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { revokeAuthoringToken } from "@/lib/auth/authoring-token";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return jsonError(401, "not_logged_in");
  if (!canManageCourses(user.role)) {
    return jsonError(403, "insufficient_role", {
      required: ["curator", "admin"],
      got: user.role,
    });
  }

  const { id } = await params;
  const revoked = await revokeAuthoringToken(user.id, id);
  if (!revoked) return jsonError(404, "token_not_found", { id });

  return NextResponse.json({ ok: true, revoked: true, id });
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

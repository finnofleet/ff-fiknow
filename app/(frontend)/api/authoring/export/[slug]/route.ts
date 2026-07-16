/**
 * Course-Bundle-Export-Endpoint — die Lese-Seite der Source-of-Truth.
 *
 *   GET /api/authoring/export/<slug>
 *     Auth:    Bearer-Token (cat_…) ODER Session-Cookie (curator/admin)
 *     Response 200: application/zip — das aktuelle Bundle als <slug>.zip,
 *       mit der aktuellen `version` ins course.mdx-Frontmatter injiziert.
 *
 *   Response 401: nicht eingeloggt / ungültiger Token
 *   Response 403: eingeloggt, aber keine Autoren-Rolle
 *   Response 404: kein Kurs mit diesem Slug im Index
 *   Response 409: Kurs existiert im Index, aber kein Bundle im Storage
 *                 (Alt-Kurs vor Storage-Einführung) — neu hochladen nötig
 *   Response 429: Rate-Limit
 *
 * Architektur (ADR 0001): Storage hält den Content, der DB-Index zeigt darauf.
 * Welche <version> aktuell ist, weiß der Index (`courses.version`) — wir lesen
 * sie dort, holen genau diese Version aus dem Bundle-Storage und packen sie
 * frisch zu ZIP. Damit schließt sich der Conflict-Round-Trip: Der Autor zieht
 * den aktuellen Stand inkl. Version, editiert, lädt mit korrekter Version
 * wieder hoch (Self-Identifying Bundle).
 */
import { NextResponse, type NextRequest } from "next/server";

import AdmZip from "adm-zip";
import matter from "gray-matter";
import config from "@payload-config";
import { getPayload } from "payload";

import { authenticateAuthoring } from "@/lib/auth/authoring-auth";
import { getBundle } from "@/lib/authoring/bundle-storage";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const EXPORT_RATE_LIMIT = 30;
const EXPORT_RATE_WINDOW_MS = 60_000;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  // 1. Auth — Bearer-Token oder Session (curator/admin)
  const auth = await authenticateAuthoring(request);
  if (!auth.ok) return jsonError(auth.status, auth.error, auth.extra);
  const user = auth.principal;

  // 2. Slug validieren
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return jsonError(400, "invalid_course_slug", { slug });
  }

  // 3. Rate-Limit (pro User)
  const limit = rateLimit(
    `export:${user.id}`,
    EXPORT_RATE_LIMIT,
    EXPORT_RATE_WINDOW_MS,
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

  // 4. Aktuelle Version aus dem DB-Index lesen
  const payload = await getPayload({ config });
  const found = await payload.find({
    collection: "courses",
    where: { slug: { equals: slug } },
    limit: 1,
    overrideAccess: true,
  });
  const course = found.docs[0];
  if (!course) {
    return jsonError(404, "course_not_found", { slug });
  }
  const version =
    typeof course.version === "string" ? course.version.trim() : "";
  if (!version) {
    return jsonError(409, "course_has_no_version", {
      slug,
      detail:
        "Dieser Kurs hat noch kein Version-Token (vor Storage-Einführung importiert). Einmal neu hochladen, danach ist Export möglich.",
    });
  }

  // 5. Bundle aus Storage holen
  const files = await getBundle(slug, version);
  if (!files) {
    return jsonError(409, "bundle_not_in_storage", {
      slug,
      version,
      detail:
        "Der Index kennt diese Version, aber im Bundle-Storage liegt kein passender Stand. Einmal neu hochladen.",
    });
  }

  // 6. Aktuelle Version ins course.mdx-Frontmatter injizieren (autoritativ aus
  //    dem Index, nicht aus dem evtl. älteren Stand in der gespeicherten Datei).
  injectVersion(files, version);

  // 7. Frisch zu ZIP packen — mit <slug>/-Top-Level-Prefix, damit ein
  //    Re-Upload exakt durch extractZipToMap (Prefix-Stripping) läuft.
  const zip = new AdmZip();
  for (const [rel, buf] of files.entries()) {
    zip.addFile(`${slug}/${rel}`, buf);
  }
  const out = zip.toBuffer();

  return new NextResponse(new Uint8Array(out), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${slug}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}

// ============================================================
// Helpers
// ============================================================

/**
 * Überschreibt das `version`-Feld im Frontmatter von course.mdx mit der
 * aktuellen Server-Version. Lässt den Body unangetastet (gray-matter berührt
 * nur den Frontmatter-Block).
 */
function injectVersion(files: Map<string, Buffer>, version: string): void {
  const key = "course.mdx";
  const buf = files.get(key);
  if (!buf) return; // sollte nie passieren (Bundle ohne course.mdx)
  const parsed = matter(buf.toString("utf8"));
  const data = { ...parsed.data, version };
  const rebuilt = matter.stringify(parsed.content, data);
  files.set(key, Buffer.from(rebuilt, "utf8"));
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

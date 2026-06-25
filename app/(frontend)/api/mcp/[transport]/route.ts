/**
 * MCP-Server für Content-Management (ADR 0003-Folge · PoC) — exponiert die
 * Authoring-Pipeline als Model-Context-Protocol-Tools, sodass MCP-fähige Clients
 * (Claude Desktop, Gruppen-Agents) Kurse anlegen/ändern/publishen können — nicht
 * nur das course-authoring-Plugin.
 *
 * Bewusst BUNDLE-Level (sinnvolle Einheit, ADR 0001 „Bundle = Source of Truth"):
 * die Tools spiegeln den bestehenden Roundtrip und rufen dieselben lib-Funktionen
 * wie die HTTP-Endpoints — direkt, mit dem Token aus dem MCP-Request.
 *
 *   Endpoint:  POST /api/mcp/mcp   (Streamable-HTTP-Transport; via mcp-handler)
 *   Auth:      Authorization: Bearer cat_…  (Authoring-Token, curator/admin)
 *   Gate:      nur aktiv wenn MCP_ENABLED=true (per-Deployment-Schalter)
 *
 * Tools:
 *   - list_courses     → Slug/Status/Version/Index aller Kurse (inkl. Drafts)
 *   - export_course    → Text-Dateien + Asset-MANIFEST (kein base64-im-Kontext)
 *   - list_assets      → Asset-Manifest eines Kurses (path/sha256/bytes)
 *   - upload_asset     → ein einzelnes Binär-Asset stagen (für neue/geänderte Bilder)
 *   - validate_bundle  → Bundle gegen die Format-Spec prüfen, ohne zu schreiben
 *   - import_course    → Bundle als Draft hochladen (gibt neue Version zurück)
 *   - publish_course   → Kurs (+ Sections/Lessons) live schalten
 *   - request_asset_upload_url → presigned URL für Out-of-Band-Bild-Upload (curl)
 *   - request_bundle_upload_url → presigned URL für Out-of-Band-Bundle-Upload (ZIP/curl)
 *   - get_authoring_guide → Autoren-Wissen je Topic (Fallback zu den Resources)
 *   - import_path / get_path / list_paths / publish_path / unpublish_path /
 *     delete_path → Lernpfad-CRUD (learning-paths; flach/strukturiert, kein Bundle)
 *
 * Resources + Prompt (Phase 2): `authoring://…`-Resources (Format, Komponenten,
 * Stil, Beispiel) + Prompt `start_authoring` — Inhalte aus lib/authoring/guide.ts,
 * markenspezifische Topics brand-aware.
 *
 * Asset-by-Reference (ADR 0004, Phase 1): Text-Dateien (mdx/md/json/svg …) gehen
 * als `text`, Binär-Assets NICHT mehr als base64 durch den Kontext, sondern nur
 * als Manifest (`{path, sha256, bytes}`). Beim Import löst der Server jede
 * Asset-Referenz per Hash auf — gegen frisch per upload_asset gestagte Bytes
 * und gegen das aktuell gespeicherte Bundle (unveränderte Assets werden NIE neu
 * übertragen). Das behebt das Import-Output-Cap-Limit des PoC.
 *
 * Phase 2 (gebaut): Wissen in MCP — Resources + Prompt + get_authoring_guide,
 * brand-aware über lib/authoring/guide.ts.
 * Phase 3 (optional): Dokument-Level-Tools, token-only-Auth.
 */
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { authenticateAuthoring } from "@/lib/auth/authoring-auth";
import { sha256Hex } from "@/lib/authoring/asset-staging";
import {
  DEFAULT_UPLOAD_TTL_SEC,
  mintBundleUploadToken,
  mintUploadToken,
} from "@/lib/authoring/asset-upload-token";
import {
  assertValidAssetPath,
  AssetUploadError,
  validateAndStageAsset,
} from "@/lib/authoring/asset-upload";
import { getBundle } from "@/lib/authoring/bundle-storage";
import { VersionConflictError } from "@/lib/authoring/errors";
import { importFromTextAndAssetRefs } from "@/lib/authoring/import";
import {
  deleteLearningPath,
  getManagedPath,
  listManagedCourses,
  listManagedPaths,
  publishCourseCascade,
  publishLearningPath,
  unpublishLearningPath,
  upsertLearningPath,
} from "@/lib/authoring/lifecycle";
import { validateBundleFiles } from "@/lib/authoring/validate-bundle";
import {
  getGuide,
  GUIDE_RESOURCES,
  GUIDE_TOPICS,
  type GuideTopic,
} from "@/lib/authoring/guide";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Welche Bundle-Dateien als Text (statt base64) übertragen werden.
const TEXT_EXT = new Set([
  "mdx",
  "md",
  "json",
  "txt",
  "yaml",
  "yml",
  "csv",
  "svg",
]);

function isTextPath(p: string): boolean {
  const ext = p.split(".").pop()?.toLowerCase() ?? "";
  return TEXT_EXT.has(ext);
}

/**
 * Öffentliche Basis-URL, die ein externer Client (curl) tatsächlich erreicht.
 * Aus den Proxy-Headern abgeleitet (wie mcp-handler selbst), mit Env-Override
 * für LB-Setups, die die Forwarding-Header umschreiben/strippen.
 */
function publicOrigin(headers: unknown): string | null {
  const override = process.env.AUTHORING_PUBLIC_URL?.trim();
  if (override) return override.replace(/\/+$/, "");

  const get = (key: string): string | undefined => {
    const h = headers as
      | { get?: (k: string) => string | null }
      | Record<string, string | string[]>
      | undefined;
    if (!h) return undefined;
    if (typeof (h as { get?: unknown }).get === "function") {
      return (h as { get: (k: string) => string | null }).get(key) ?? undefined;
    }
    const v = (h as Record<string, string | string[]>)[key];
    return Array.isArray(v) ? v[0] : v;
  };

  const host = get("x-forwarded-host") || get("host");
  if (!host) return null;
  const proto = get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

function jsonResult(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function errorResult(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

const mcpHandler = createMcpHandler(
  (server) => {
    // --- list_courses ----------------------------------------------------
    server.registerTool(
      "list_courses",
      {
        title: "Kurse auflisten",
        description:
          "Listet alle Kurse (inkl. Drafts) mit Slug, Titel, Status (draft/published), aktueller Version und Tutor-Flag.",
        inputSchema: {},
      },
      async (): Promise<ToolResult> => {
        const courses = await listManagedCourses();
        return jsonResult(courses);
      },
    );

    // --- export_course ---------------------------------------------------
    server.registerTool(
      "export_course",
      {
        title: "Kurs-Bundle exportieren",
        description:
          "Gibt das aktuelle Bundle eines Kurses zurück: `files` = Text-Dateien (course.mdx + Section-/Lesson-MDX + SVG) als `text`; `assets` = Binär-Assets nur als Manifest `{path, sha256, bytes}` — KEIN base64. Beim erneuten import_course unveränderte Assets einfach als `{path, sha256}` zurückgeben; nur geänderte/neue Bilder vorher per upload_asset stagen.",
        inputSchema: { slug: z.string().describe("Kurs-Slug") },
      },
      async ({ slug }): Promise<ToolResult> => {
        const course = (await listManagedCourses()).find((c) => c.slug === slug);
        if (!course) return errorResult(`Kein Kurs mit Slug "${slug}".`);
        if (!course.version) {
          return errorResult(
            `Kurs "${slug}" hat keine gespeicherte Bundle-Version (Alt-Kurs vor Storage-Einführung) — bitte neu hochladen.`,
          );
        }
        const bundle = await getBundle(slug, course.version);
        if (!bundle) {
          return errorResult(
            `Kein Bundle im Storage für ${slug}@${course.version}.`,
          );
        }
        const files: { path: string; text: string }[] = [];
        const assets: { path: string; sha256: string; bytes: number }[] = [];
        for (const [p, buf] of bundle.entries()) {
          if (isTextPath(p)) {
            files.push({ path: p, text: buf.toString("utf8") });
          } else {
            assets.push({ path: p, sha256: sha256Hex(buf), bytes: buf.length });
          }
        }
        return jsonResult({ slug, version: course.version, files, assets });
      },
    );

    // --- request_bundle_upload_url ---------------------------------------
    server.registerTool(
      "request_bundle_upload_url",
      {
        title: "Direkten Bundle-Upload anfordern (bevorzugt bei Shell-Zugriff)",
        description:
          "BEVORZUGTER Weg, ein ganzes Kurs-Bundle hochzuladen, wenn du Shell-/curl-Zugriff hast (local-agent-mode/CLI): gibt eine presigned URL + fertige curl-Zeile zurück, gegen die du das LOKAL gezippte Bundle POSTest. MDX-Text UND Assets gehen direkt per HTTP — NICHT durch deinen Kontext (du gibst eine curl-Zeile aus statt des ganzen Bundle-Texts). Lädt als DRAFT (publish_course separat); die curl-Antwort ist die Import-Summary inkl. neuer version. import_course (files[]) nur als Fallback ohne Shell. URL ~5 Min gültig, nur für diesen courseSlug.",
        inputSchema: {
          courseSlug: z.string().describe("Kurs-Slug"),
        },
      },
      async ({ courseSlug }, extra): Promise<ToolResult> => {
        if (!/^[a-z0-9-]+$/.test(courseSlug)) {
          return errorResult(`Ungültiger courseSlug "${courseSlug}".`);
        }
        const origin = publicOrigin(extra?.requestInfo?.headers);
        if (!origin) {
          return errorResult(
            "Konnte die öffentliche Basis-URL nicht ermitteln. AUTHORING_PUBLIC_URL im Deployment setzen.",
          );
        }
        const { token, expiresAt } = mintBundleUploadToken(courseSlug);
        const url =
          `${origin}/api/authoring/import?courseSlug=${encodeURIComponent(courseSlug)}` +
          `&token=${token}`;
        return jsonResult({
          uploadUrl: url,
          method: "POST",
          expiresInSec: DEFAULT_UPLOAD_TTL_SEC,
          expiresAt: new Date(expiresAt * 1000).toISOString(),
          curl:
            `zip -r /tmp/${courseSlug}.zip <bundle-ordner>/ && ` +
            `curl -sS -X POST "${url}" -F "bundle=@/tmp/${courseSlug}.zip"`,
          note: "<bundle-ordner> = dein lokaler Kurs-Ordner (mit course.mdx im Wurzel- oder einem einzelnen Top-Ordner). Bundle zippen + per curl hochladen — NICHT den Inhalt durch den Kontext schicken. Antwort = Import-Summary (neue version); danach publish_course zum Live-Schalten.",
        });
      },
    );

    // --- import_course ---------------------------------------------------
    server.registerTool(
      "import_course",
      {
        title: "Kurs-Bundle importieren (Draft)",
        description:
          "FALLBACK für Clients OHNE Shell. Wenn du curl/Shell hast, nutze stattdessen request_bundle_upload_url (Bundle als ZIP out-of-band — der MDX-Text läuft dann NICHT durch deinen Kontext). " +
          "Lädt ein Bundle als DRAFT hoch (geht nie sofort live — publish_course separat). `files` = alle Text-Dateien (course.mdx + Section-/Lesson-MDX + SVG) als `text`; `assets` = Binär-Assets nur als Referenz `{path, sha256}`. Der Server löst jede Asset-Referenz per Hash auf (gegen upload_asset-Staging + aktuelles Bundle) — unveränderte Assets nie neu übertragen. Geänderte/neue Bilder vorher per upload_asset stagen. Bei Versions-Konflikt wird NICHT überschrieben.",
        inputSchema: {
          courseSlug: z.string().describe("Kurs-Slug"),
          files: z
            .array(
              z.object({
                path: z
                  .string()
                  .describe("Bundle-root-relativer Pfad, z. B. course.mdx"),
                text: z.string().describe("Inhalt der Text-Datei (UTF-8)"),
              }),
            )
            .describe("Alle Text-Dateien des Bundles (mdx/md/json/svg …)"),
          assets: z
            .array(
              z.object({
                path: z
                  .string()
                  .describe("Bundle-root-relativer Asset-Pfad, z. B. assets/images/foo.png"),
                sha256: z
                  .string()
                  .describe("SHA-256-Hex der Asset-Bytes (aus dem Export-Manifest)"),
              }),
            )
            .optional()
            .describe("Binär-Assets als Hash-Referenzen (kein base64)"),
        },
      },
      async ({ courseSlug, files, assets }): Promise<ToolResult> => {
        try {
          const summary = await importFromTextAndAssetRefs(
            courseSlug,
            files,
            assets ?? [],
          );
          return jsonResult({
            ok: true,
            courseSlug,
            version: summary.version,
            course: summary.course,
            sections: summary.sections.length,
            note: "Als Draft importiert. publish_course aufrufen, um live zu schalten.",
          });
        } catch (err) {
          if (err instanceof VersionConflictError) {
            return errorResult(
              `Versions-Konflikt: ${err.message}. Erst export_course ziehen (aktuelle Version), Änderungen darauf anwenden, dann erneut importieren.`,
            );
          }
          return errorResult(
            `Import fehlgeschlagen: ${(err as Error).message}`,
          );
        }
      },
    );

    // --- list_assets -----------------------------------------------------
    server.registerTool(
      "list_assets",
      {
        title: "Asset-Manifest eines Kurses",
        description:
          "Listet die Binär-Assets des aktuell gespeicherten Bundles als Manifest `{path, sha256, bytes}` — ohne Inhalt. Für Asset-by-Reference: so kennst du die Hashes, die du im import_course referenzierst.",
        inputSchema: { slug: z.string().describe("Kurs-Slug") },
      },
      async ({ slug }): Promise<ToolResult> => {
        const course = (await listManagedCourses()).find((c) => c.slug === slug);
        if (!course) return errorResult(`Kein Kurs mit Slug "${slug}".`);
        if (!course.version) {
          return errorResult(
            `Kurs "${slug}" hat keine gespeicherte Bundle-Version.`,
          );
        }
        const bundle = await getBundle(slug, course.version);
        if (!bundle) {
          return errorResult(
            `Kein Bundle im Storage für ${slug}@${course.version}.`,
          );
        }
        const assets = [...bundle.entries()]
          .filter(([p]) => !isTextPath(p))
          .map(([p, buf]) => ({
            path: p,
            sha256: sha256Hex(buf),
            bytes: buf.length,
          }));
        return jsonResult({ slug, version: course.version, assets });
      },
    );

    // --- request_asset_upload_url ----------------------------------------
    server.registerTool(
      "request_asset_upload_url",
      {
        title: "Direkten Asset-Upload anfordern (bevorzugt)",
        description:
          "BEVORZUGTER Weg, ein neues/geändertes Bild hochzuladen: gibt eine fertige, vor-signierte Upload-URL zurück, gegen die du das LOKALE FILE direkt per curl POSTest — die Bytes laufen NIE durch deinen Kontext (kein base64, keine Korruption, keine Credentials nötig, das Token steckt in der URL). Nutze dies statt upload_asset, wann immer du Shell-/curl-Zugriff hast. Die URL ist ~5 Min gültig und gilt nur für genau diesen courseSlug+path. Antwort enthält ein `curl`-Feld zum direkten Ausführen. Danach den zurückgegebenen sha256 (aus der curl-Antwort) im import_course als {path, sha256} referenzieren. Nur Bild-Typen (png/jpg/jpeg/webp/gif); SVG ist Text → import_course files[].",
        inputSchema: {
          courseSlug: z.string().describe("Kurs-Slug"),
          path: z
            .string()
            .describe("Bundle-root-relativer Ziel-Pfad, z. B. assets/images/cover.jpg"),
        },
      },
      async ({ courseSlug, path }, extra): Promise<ToolResult> => {
        try {
          assertValidAssetPath(path);
        } catch (err) {
          if (err instanceof AssetUploadError) return errorResult(err.message);
          throw err;
        }
        const origin = publicOrigin(extra?.requestInfo?.headers);
        if (!origin) {
          return errorResult(
            "Konnte die öffentliche Basis-URL nicht ermitteln. AUTHORING_PUBLIC_URL im Deployment setzen.",
          );
        }
        const { token, expiresAt } = mintUploadToken(courseSlug, path);
        const url =
          `${origin}/api/authoring/asset?courseSlug=${encodeURIComponent(courseSlug)}` +
          `&path=${encodeURIComponent(path)}&token=${token}`;
        return jsonResult({
          uploadUrl: url,
          method: "POST",
          expiresInSec: DEFAULT_UPLOAD_TTL_SEC,
          expiresAt: new Date(expiresAt * 1000).toISOString(),
          curl: `curl -sS -X POST "${url}" -H "Content-Type: application/octet-stream" --data-binary @<lokale-datei>`,
          note: "Bytes per curl direkt hochladen (NICHT durch den Kontext). Die curl-Antwort enthält den sha256 — diesen dann im import_course als { path, sha256 } referenzieren.",
        });
      },
    );

    // --- upload_asset ----------------------------------------------------
    server.registerTool(
      "upload_asset",
      {
        title: "Einzelnes Asset stagen",
        description:
          "Stagt ein einzelnes neues/geändertes Binär-Asset (Bild) als base64 und gibt seinen `sha256` zurück. Danach im import_course als `{path, sha256}` referenzieren. Nur Bild-Typen (png/jpg/jpeg/webp/gif); SVG ist Text und geht über import_course `files[]`. WICHTIG: base64 hier zwingt das Modell, die Bytes als Token auszugeben — langsam selbst für kleine Bilder. Wenn du Shell-/curl-Zugriff hast (local-agent-mode, CLI), lade STATTDESSEN direkt hoch: `curl -X POST \"$HOST/api/authoring/asset?courseSlug=<slug>&path=<assets/...>\" -H \"Authorization: Bearer cat_…\" --data-binary @datei` — gibt denselben sha256 zurück, ohne dass die Bytes durch den Kontext laufen.",
        inputSchema: {
          courseSlug: z.string().describe("Kurs-Slug"),
          path: z
            .string()
            .describe("Bundle-root-relativer Ziel-Pfad, z. B. assets/images/foo.png"),
          base64: z.string().describe("base64-kodierte Asset-Bytes"),
          contentType: z
            .string()
            .optional()
            .describe("Optionaler MIME-Type; muss zur Datei-Extension passen"),
        },
      },
      async ({ courseSlug, path, base64, contentType }): Promise<ToolResult> => {
        let bytes: Buffer;
        try {
          bytes = Buffer.from(base64, "base64");
        } catch {
          return errorResult(`Ungültiges base64 für "${path}".`);
        }
        try {
          const staged = await validateAndStageAsset({
            courseSlug,
            path,
            bytes,
            contentType,
          });
          return jsonResult({
            ok: true,
            ...staged,
            note: `Gestagt. Im import_course als { path: "${staged.path}", sha256: "${staged.sha256}" } referenzieren.`,
          });
        } catch (err) {
          if (err instanceof AssetUploadError) return errorResult(err.message);
          throw err;
        }
      },
    );

    // --- validate_bundle -------------------------------------------------
    server.registerTool(
      "validate_bundle",
      {
        title: "Bundle validieren (ohne Schreiben)",
        description:
          "Prüft ein Bundle gegen die Format-Spec (Struktur, Slugs, NN-Präfixe, MDX-Sicherheits-Pipeline) OHNE etwas zu schreiben. Gibt strukturierte Befunde `[{file, line?, message}]` zurück — leere Liste = gültig. Vor import_course aufrufen, um Fehler früh und vollständig zu sehen. `files` wie bei import_course; `assets` optional (nur Pfade fürs Struktur-Bild).",
        inputSchema: {
          courseSlug: z.string().describe("Kurs-Slug"),
          files: z
            .array(
              z.object({
                path: z.string().describe("Bundle-root-relativer Pfad"),
                text: z.string().describe("Inhalt der Text-Datei (UTF-8)"),
              }),
            )
            .describe("Alle Text-Dateien des Bundles"),
          assets: z
            .array(z.object({ path: z.string() }))
            .optional()
            .describe("Asset-Pfade (optional, nur fürs vollständige Struktur-Bild)"),
        },
      },
      async ({ courseSlug, files, assets }): Promise<ToolResult> => {
        const map = new Map<string, Buffer>();
        for (const f of files) {
          map.set(f.path, Buffer.from(f.text, "utf8"));
        }
        // Asset-Pfade als 0-Byte-Platzhalter, damit der Parser das vollständige
        // Struktur-Bild sieht (Bytes werden bei der Validierung nicht geprüft).
        for (const a of assets ?? []) {
          if (!map.has(a.path)) map.set(a.path, Buffer.alloc(0));
        }
        try {
          const findings = await validateBundleFiles(courseSlug, map);
          return jsonResult({
            valid: findings.length === 0,
            findings,
          });
        } catch (err) {
          return errorResult(
            `Validierung fehlgeschlagen: ${(err as Error).message}`,
          );
        }
      },
    );

    // --- publish_course --------------------------------------------------
    server.registerTool(
      "publish_course",
      {
        title: "Kurs veröffentlichen",
        description:
          "Schaltet einen Kurs samt Sections und Lessons live (_status=published).",
        inputSchema: { slug: z.string().describe("Kurs-Slug") },
      },
      async ({ slug }): Promise<ToolResult> => {
        const course = (await listManagedCourses()).find((c) => c.slug === slug);
        if (!course) return errorResult(`Kein Kurs mit Slug "${slug}".`);
        const res = await publishCourseCascade(course.id);
        return jsonResult({
          ok: true,
          slug,
          courseId: course.id,
          publishedSections: res.sections,
          publishedLessons: res.lessons,
        });
      },
    );

    // ====================================================================
    // Lernpfad-Authoring (learning-paths) — volles CRUD. Pfade sind flach/
    // strukturiert (kein Bundle): Tools nehmen die Daten direkt, schreiben in
    // die Collection. Slug-Discovery über list_courses. Landen als Draft.
    // ====================================================================

    const pathCourseSchema = z.object({
      courseSlug: z.string().describe("Slug eines bestehenden Kurses (siehe list_courses)"),
      role: z
        .enum(["required", "recommended", "optional"])
        .describe("Kern / Empfohlen / Optional"),
    });

    // --- import_path (Create/Edit) --------------------------------------
    server.registerTool(
      "import_path",
      {
        title: "Lernpfad anlegen/ändern (Draft)",
        description:
          "Legt einen Lernpfad an oder aktualisiert ihn (Upsert by Slug) — bündelt bestehende Kurse zu einer Reihe. Kurse per Slug referenzieren (vorher list_courses für die Slugs). Landet IMMER als DRAFT (publish_path separat). Ein Edit setzt einen live-Pfad bewusst zurück auf Draft. Zum Ändern erst get_path ziehen, Felder anpassen, hier zurückschreiben. fuehrungsgrad: 'linear' (geführt) oder 'lose' (empfohlen) — nur Darstellung, sperrt nichts.",
        inputSchema: {
          slug: z.string().describe("Pfad-Slug, kebab-case ^[a-z0-9-]+$"),
          title: z.string().describe("Titel"),
          subtitle: z.string().optional(),
          description: z.string().optional(),
          fuehrungsgrad: z.enum(["linear", "lose"]),
          courses: z
            .array(pathCourseSchema)
            .describe("Kurse in gewünschter Reihenfolge (Position = Reihenfolge im Pfad)"),
        },
      },
      async (input): Promise<ToolResult> => {
        try {
          const res = await upsertLearningPath(input);
          return jsonResult({
            ok: true,
            ...res,
            note: "Als Draft gespeichert. Mit publish_path live schalten; als Admin unter /paths/<slug> testbar.",
          });
        } catch (err) {
          return errorResult(`Pfad-Import fehlgeschlagen: ${(err as Error).message}`);
        }
      },
    );

    // --- get_path (Checkout für Edit) -----------------------------------
    server.registerTool(
      "get_path",
      {
        title: "Lernpfad abrufen (zum Editieren)",
        description:
          "Gibt einen Pfad vollständig zurück (alle Felder + komplette Kursliste mit Rollen + Status). Vor einem Edit ziehen, ändern und per import_path zurückschreiben.",
        inputSchema: { slug: z.string().describe("Pfad-Slug") },
      },
      async ({ slug }): Promise<ToolResult> => {
        const path = await getManagedPath(slug);
        if (!path) return errorResult(`Kein Lernpfad mit Slug "${slug}".`);
        return jsonResult(path);
      },
    );

    // --- list_paths -----------------------------------------------------
    server.registerTool(
      "list_paths",
      {
        title: "Lernpfade auflisten",
        description:
          "Listet alle Lernpfade (inkl. Drafts) mit Slug, Titel, Status, Führungsgrad und Kursanzahl.",
        inputSchema: {},
      },
      async (): Promise<ToolResult> => {
        return jsonResult(await listManagedPaths());
      },
    );

    // --- publish_path ---------------------------------------------------
    server.registerTool(
      "publish_path",
      {
        title: "Lernpfad veröffentlichen",
        description: "Schaltet einen Pfad live (_status=published).",
        inputSchema: { slug: z.string().describe("Pfad-Slug") },
      },
      async ({ slug }): Promise<ToolResult> => {
        const ok = await publishLearningPath(slug);
        if (!ok) return errorResult(`Kein Lernpfad mit Slug "${slug}".`);
        return jsonResult({ ok: true, slug, status: "published" });
      },
    );

    // --- unpublish_path -------------------------------------------------
    server.registerTool(
      "unpublish_path",
      {
        title: "Lernpfad offline nehmen",
        description:
          "Nimmt einen Pfad vom Netz (zurück auf Draft) — reversibel, kein Datenverlust. Für Lerner unsichtbar, für Autoren/Admins weiter testbar.",
        inputSchema: { slug: z.string().describe("Pfad-Slug") },
      },
      async ({ slug }): Promise<ToolResult> => {
        const ok = await unpublishLearningPath(slug);
        if (!ok) return errorResult(`Kein Lernpfad mit Slug "${slug}".`);
        return jsonResult({ ok: true, slug, status: "draft" });
      },
    );

    // --- delete_path ----------------------------------------------------
    server.registerTool(
      "delete_path",
      {
        title: "Lernpfad löschen",
        description:
          "Löscht einen Lernpfad endgültig. Berührt keine Kurse (ein Pfad referenziert sie nur). Zum bloßen Offline-Nehmen stattdessen unpublish_path.",
        inputSchema: { slug: z.string().describe("Pfad-Slug") },
      },
      async ({ slug }): Promise<ToolResult> => {
        const ok = await deleteLearningPath(slug);
        if (!ok) return errorResult(`Kein Lernpfad mit Slug "${slug}".`);
        return jsonResult({ ok: true, slug, deleted: true });
      },
    );

    // ====================================================================
    // Wissen in MCP (ADR 0004, Phase 2) — Resources + Prompt + Guide-Tool.
    // Macht das Autoren-Rezept plugin-unabhängig verfügbar (Desktop/Cowork
    // laden keine Claude-Code-Skills). Inhalte aus lib/authoring/guide.ts,
    // markenspezifische Topics brand-aware. Liegen hinter derselben Auth/Gate
    // wie die Tools.
    // ====================================================================

    // --- Resources (eine je Wissens-Topic) ------------------------------
    for (const def of GUIDE_RESOURCES) {
      server.registerResource(
        def.name,
        def.uri,
        {
          title: def.title,
          description: def.description,
          mimeType: "text/markdown",
        },
        async (uri) => ({
          contents: [
            { uri: uri.href, mimeType: "text/markdown", text: getGuide(def.topic) },
          ],
        }),
      );
    }

    // --- get_authoring_guide (Fallback-Tool) ----------------------------
    // Viele Clients zeigen Resources schwach an → dasselbe Wissen auch als
    // Tool, das den Text direkt zurückgibt.
    server.registerTool(
      "get_authoring_guide",
      {
        title: "Autoren-Guide abrufen",
        description:
          `Liefert das Autoren-Wissen für ein Topic als Text. Topics: ${GUIDE_TOPICS.join(", ")}. ` +
          "Ohne Topic: Überblick. Nutze dies, wenn dein Client Resources nicht gut anzeigt. " +
          "image-style/diagram-style/content-style sind markenspezifisch.",
        inputSchema: {
          topic: z
            .enum(GUIDE_TOPICS as unknown as [GuideTopic, ...GuideTopic[]])
            .optional()
            .describe("Wissens-Topic (Default: overview)"),
        },
      },
      async ({ topic }): Promise<ToolResult> => {
        return { content: [{ type: "text", text: getGuide(topic ?? "overview") }] };
      },
    );

    // --- start_authoring (Prompt) ---------------------------------------
    // Seedet das Gespräch mit Überblick + Workflow, damit ein Client per
    // „Prompt verwenden" direkt loslegt.
    server.registerPrompt(
      "start_authoring",
      {
        title: "Kurs-Authoring starten",
        description:
          "Seedet das Gespräch mit dem Autoren-Rezept (Überblick + Workflow). Optional eine Aufgabe mitgeben.",
        argsSchema: {
          task: z
            .string()
            .optional()
            .describe("Was soll autort werden? (optional)"),
        },
      },
      async ({ task }) => ({
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text:
                `${getGuide("overview")}\n\n---\n\n${getGuide("workflow")}\n\n---\n\n` +
                "Lies bei Bedarf die Topics über `get_authoring_guide` (oder die " +
                "`authoring://`-Resources): bundle-format, components, content-style, " +
                "image-style, diagram-style, example.\n\n" +
                (task
                  ? `Aufgabe: ${task}`
                  : "Frag mich, was ich autoren möchte, und leite mich durch den Ablauf."),
            },
          },
        ],
      }),
    );
  },
  {},
  { basePath: "/api/mcp", maxDuration: 120, verboseLogs: false },
);

/**
 * Token-Verifikation für den MCP-Request: dasselbe `cat_…`-Bearer-Token +
 * frische Rollen-Prüfung wie die Authoring-Endpoints (curator/admin). Session-
 * Fallback greift für MCP-Clients nicht (keine Cookies) → kein Treffer = 401.
 */
const verifyToken = async (req: Request): Promise<AuthInfo | undefined> => {
  const auth = await authenticateAuthoring(req as unknown as NextRequest);
  if (!auth.ok) return undefined;
  return {
    token: "authoring",
    clientId: auth.principal.id,
    scopes: ["authoring"],
  };
};

const authedHandler = withMcpAuth(mcpHandler, verifyToken, { required: true });

// Per-Deployment-Schalter: ohne MCP_ENABLED=true ist die ganze Fläche aus.
function gated(
  handler: (req: Request) => Promise<Response> | Response,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    if (process.env.MCP_ENABLED !== "true") {
      return new Response(JSON.stringify({ error: "mcp_disabled" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    return handler(req);
  };
}

const handler = gated(authedHandler);

export { handler as GET, handler as POST, handler as DELETE };

#!/usr/bin/env node
/**
 * client.mjs — authentifizierter Direkt-Client zur Plattform-Authoring-API.
 *
 * Sub-Kommandos für den Authoring-Loop aus ADR 0001 (Decision 6):
 *
 *   login    → Loopback-OAuth: öffnet den Browser, mintet einen Token und
 *              speichert ihn in ~/.edu-platform/credentials.json (chmod 600)
 *   checkout → GET  /api/authoring/export/<slug> (Download: aktuelles Bundle
 *              inkl. Version-Token zum Editieren auschecken)
 *   upload   → POST /api/authoring/import   (Commit als Draft, 409-Konflikt-Check)
 *   publish  → POST /api/authoring/publish  (Draft → live, separater expliziter Schritt)
 *
 * Same Token, same Bundle-Payload, unterschiedlicher Effekt.
 *
 * Token-Auflösung — bewusst KEINE CLI-Args für den Token, damit er nicht in
 * Shell-History / Prozess-Listen landet:
 *
 *   EDU_PLATFORM_BASE_URL   z.B. https://verstande.ch (oder per --base-url)
 *   EDU_AUTHORING_TOKEN     cat_… — optional; `login` legt ihn im Credential-
 *                           Store ab. Gesetzte Env-Var schlägt den Store.
 *
 * Output: JSON auf stdout für die Skills. Fehler-Details auf stderr.
 * Exit-Codes:
 *   0 = ok
 *   1 = unbekannter/Server-Fehler (500)
 *   2 = Auth-Problem (401 invalid_token / not_logged_in)
 *   3 = Rollen-Problem (403 insufficient_role)
 *   4 = Bad-Request (400, inkl. mdx_validation_failed, missing_*)
 *   5 = lokaler Eingabe-Fehler (Datei fehlt, kein gültiges JSON, kein Bundle)
 *   9 = 409 version_conflict (Bundle-Version weicht von Server ab)
 *  13 = 413 bundle_too_large
 *  29 = 429 rate_limited (retry_after_sec im JSON)
 *
 * Sicherheits-Constraints (siehe ADR 0001, Sicherheits-Anforderung 5):
 *   - Token wird NIE in stdout/stderr/JSON ausgegeben.
 *   - Bei 401 sagt der Client dem Skill "Token neu minten", retried NICHT.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

import AdmZip from "adm-zip";

import { bundleToZip, formatBytes } from "./publish.mjs";

// ============================================================
// Exit-Codes als Konstanten
// ============================================================

const EXIT_OK = 0;
const EXIT_SERVER = 1;
const EXIT_AUTH = 2;
const EXIT_ROLE = 3;
const EXIT_BAD_REQUEST = 4;
const EXIT_LOCAL = 5;
const EXIT_CONFLICT = 9;
const EXIT_TOO_LARGE = 13;
const EXIT_RATE_LIMITED = 29;

// ============================================================
// CLI-Parsing
// ============================================================

const [, , subcommand, ...rest] = process.argv;

if (!subcommand || subcommand === "--help" || subcommand === "-h") {
  printUsage();
  process.exit(subcommand ? EXIT_OK : EXIT_LOCAL);
}

const opts = parseFlags(rest);

const baseUrl = trimSlash(opts.baseUrl ?? process.env.EDU_PLATFORM_BASE_URL);

if (!baseUrl) {
  failLocal(
    "Keine Plattform-Base-URL. Setze EDU_PLATFORM_BASE_URL oder übergib --base-url <url>.",
  );
}

// Token-Auflösung: explizite Env-Var schlägt den Credential-Store (aus
// `client.mjs login`). `login` selbst braucht keinen Token — es holt ja erst
// einen. Alle anderen Kommandos brauchen einen.
let token = process.env.EDU_AUTHORING_TOKEN ?? loadStoredToken(baseUrl);

if (subcommand !== "login" && !token) {
  failLocal(
    "Kein Authoring-Token. Führe `node client.mjs login` aus (öffnet den Browser) " +
      "oder setze EDU_AUTHORING_TOKEN (Format cat_…).",
  );
}

try {
  switch (subcommand) {
    case "login":
      await cmdLogin();
      break;
    case "checkout":
      await cmdCheckout();
      break;
    case "upload":
      await cmdUpload();
      break;
    case "publish":
      await cmdPublish();
      break;
    default:
      failLocal(`Unbekanntes Sub-Kommando: ${subcommand}`);
  }
} catch (err) {
  // Letzte Auffanglinie — niemals Token-Leak
  emitError(EXIT_SERVER, "unexpected_error", err?.message ?? String(err));
}

// ============================================================
// Sub-Kommando: checkout (Download: bestehenden Kurs zum Editieren auschecken)
// ============================================================

/**
 * GET /api/authoring/export/<slug> → application/zip. Der Server packt das
 * aktuelle Bundle frisch und injiziert die autoritative `version` ins
 * course.mdx-Frontmatter (Self-Identifying Bundle, schliesst den Conflict-
 * Round-Trip). Das ZIP hat einen <slug>/-Top-Level-Prefix → entpacken nach
 * <outDir> ergibt direkt den Bundle-Ordner <outDir>/<slug>/.
 */
async function cmdCheckout() {
  const slug = opts._[0];
  if (!slug) failLocal("Usage: client.mjs checkout <slug> [--out <dir>] [--force]");
  if (!/^[a-z0-9-]+$/.test(slug)) {
    failLocal(`Slug ungültig: "${slug}" (erlaubt: a-z, 0-9, -)`);
  }

  const res = await fetch(joinUrl(baseUrl, `/api/authoring/export/${slug}`), {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    await handleExportError(res, slug);
    return;
  }

  const contentType = res.headers.get("Content-Type") ?? "";
  if (!contentType.includes("zip")) {
    failLocal(
      `Unerwartete Antwort vom Export-Endpoint (kein ZIP, Content-Type: ${contentType || "?"}).`,
    );
  }

  const buf = Buffer.from(await res.arrayBuffer());

  // Zielordner: --out <dir> oder cwd. Das ZIP trägt den <slug>/-Prefix selbst.
  const outDir = opts.out ? resolve(opts.out) : process.cwd();
  const bundleDir = join(outDir, slug);

  // Existierende lokale Edits nicht stillschweigend überbügeln.
  if (existsSync(bundleDir) && !opts.force) {
    failLocal(
      `Zielordner existiert bereits: ${bundleDir}. Mit --force überschreiben ` +
        `(lokale Änderungen gehen verloren) oder --out <dir> wählen.`,
    );
  }

  let fileCount;
  try {
    const zip = new AdmZip(buf);
    zip.extractAllTo(outDir, /* overwrite */ true);
    fileCount = zip.getEntries().filter((e) => !e.isDirectory).length;
  } catch (err) {
    failLocal(`ZIP konnte nicht entpackt werden: ${err.message}`);
  }

  emitOk({
    command: "checkout",
    courseSlug: slug,
    bundleDir,
    fileCount,
    version: readBundleVersion(bundleDir),
    hint:
      "Kurs ausgecheckt. Editiere MDX/Assets im Bundle-Ordner, dann `upload` " +
      "(Draft) → im Learner-Shell prüfen → `publish`. Das version-Feld im " +
      "course.mdx NICHT von Hand ändern — es schützt vor dem Überschreiben " +
      "fremder Änderungen (Optimistic Locking).",
  });
}

/** Fehler-Mapping speziell für den Export-Endpoint (404/409 sind eigen). */
async function handleExportError(res, slug) {
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { _raw: text };
  }
  const errorCode = body.error ?? `http_${res.status}`;
  const retryAfter = res.headers.get("Retry-After") ?? body.retry_after_sec;

  switch (res.status) {
    case 401:
      emitError(
        EXIT_AUTH,
        errorCode,
        errorCode === "invalid_token"
          ? "Der Authoring-Token ist ungültig, abgelaufen oder widerrufen. Führe `node client.mjs login` aus."
          : "Nicht eingeloggt — Token fehlt oder Header wurde nicht akzeptiert.",
        body,
      );
      break;
    case 403:
      emitError(
        EXIT_ROLE,
        errorCode,
        `Rolle reicht nicht: erwartet "${body.required ?? "curator|admin"}", aktuell "${body.got ?? "unbekannt"}".`,
        body,
      );
      break;
    case 404:
      emitError(
        EXIT_BAD_REQUEST,
        errorCode,
        `Kein Kurs mit Slug "${slug}" im Index. Slug prüfen oder den Kurs zuerst hochladen.`,
        body,
      );
      break;
    case 409:
      emitError(
        EXIT_CONFLICT,
        errorCode,
        body.detail ??
          `Kurs "${slug}" lässt sich nicht exportieren (${errorCode}). Einmal neu hochladen.`,
        body,
      );
      break;
    case 429:
      emitError(
        EXIT_RATE_LIMITED,
        errorCode,
        `Rate-Limit erreicht (${body.limit ?? "?"}). Retry-After: ${retryAfter ?? "?"} s.`,
        body,
      );
      break;
    case 400:
      emitError(
        EXIT_BAD_REQUEST,
        errorCode,
        body.detail ? `Bad-Request: ${errorCode} — ${body.detail}` : `Bad-Request: ${errorCode}`,
        body,
      );
      break;
    default:
      emitError(
        EXIT_SERVER,
        errorCode,
        body.detail ?? `Server-Fehler (HTTP ${res.status}).`,
        body,
      );
  }
}

/** Liest das version-Feld aus dem course.mdx eines ausgecheckten Bundles. */
function readBundleVersion(bundleDir) {
  try {
    const src = readFileSync(join(bundleDir, "course.mdx"), "utf8");
    const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const m = fm?.[1].match(/^version:\s*"?([^"\n]+?)"?\s*$/m);
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

// ============================================================
// Sub-Kommando: upload (Draft-Commit, 409-Aware, Version-Write-back)
// ============================================================

async function cmdUpload() {
  const bundlePath = opts._[0];
  if (!bundlePath) failLocal("Usage: client.mjs upload <bundle-folder> [--course-slug <slug>]");

  let packed;
  try {
    packed = bundleToZip(bundlePath);
  } catch (err) {
    failLocal(err.message);
  }

  const courseSlug = opts.courseSlug ?? packed.courseSlug;
  if (!/^[a-z0-9-]+$/.test(courseSlug)) {
    failLocal(`Slug ungültig: "${courseSlug}" (erlaubt: a-z, 0-9, -)`);
  }

  const form = new FormData();
  form.append(
    "bundle",
    new Blob([packed.buffer], { type: "application/zip" }),
    `${courseSlug}.zip`,
  );
  form.append("courseSlug", courseSlug);

  const res = await fetch(joinUrl(baseUrl, "/api/authoring/import"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  await handleResponse(res, async (body) => {
    const newVersion = extractServerVersion(body);
    const writeBack = newVersion
      ? await writeVersionToFrontmatter(packed.absoluteBundle, newVersion)
      : { applied: false, reason: "no_version_in_response" };

    emitOk({
      command: "upload",
      courseSlug,
      bundleSizeBytes: packed.buffer.length,
      bundleSizeHuman: formatBytes(packed.buffer.length),
      fileCount: packed.fileCount,
      summary: body.summary ?? null,
      versionWriteBack: writeBack,
      status: "draft",
      hint:
        "Upload ist als DRAFT eingespielt. Sichtbar erst nach separatem publish-Schritt (skill course-publish).",
    });
  });
}

// ============================================================
// Sub-Kommando: publish (Draft → live)
// ============================================================

async function cmdPublish() {
  const courseIdRaw = opts._[0];
  const courseId = Number.parseInt(courseIdRaw, 10);
  if (!Number.isFinite(courseId) || courseId <= 0) {
    failLocal(`Usage: client.mjs publish <courseId> [--no-children]   (courseId muss positive Zahl sein, war: "${courseIdRaw}")`);
  }
  const includeChildren = !opts.noChildren;

  const res = await postJson("/api/authoring/publish", {
    courseId,
    includeChildren,
  });

  await handleResponse(res, (body) => {
    emitOk({
      command: "publish",
      courseId,
      includeChildren,
      course: body.course ?? null,
      children: body.children ?? null,
    });
  });
}

// ============================================================
// Sub-Kommando: login (Loopback-OAuth — holt Token via Browser)
// ============================================================

/**
 * Startet einen Loopback-Server auf 127.0.0.1:<random>, öffnet den Browser
 * auf die `cli-auth`-Seite und wartet, bis der Mensch dort autorisiert. Der
 * Token kommt über den Loopback zurück (state-Nonce-geprüft) und wird im
 * Credential-Store abgelegt. Der Token wird NIE geloggt.
 */
async function cmdLogin() {
  const state = randomBytes(24).toString("base64url");
  const server = await startLoopbackServer(state);
  const redirectUri = `http://127.0.0.1:${server.port}/callback`;
  const authUrl = joinUrl(
    baseUrl,
    `/authoring/cli-auth?redirect=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`,
  );

  console.error("Öffne Browser zur Autorisierung …");
  console.error(`Falls sich nichts öffnet, manuell aufrufen:\n  ${authUrl}\n`);
  openBrowser(authUrl);

  let result;
  try {
    result = await withTimeout(server.tokenPromise, 180_000);
  } catch (err) {
    server.close();
    failLocal(
      err?.message === "timeout"
        ? "Login-Timeout (180 s) — keine Autorisierung empfangen. `login` erneut versuchen."
        : `Login abgebrochen: ${err?.message ?? String(err)}`,
    );
    return;
  }
  server.close();

  const stored = await storeToken(baseUrl, result.token, result.expiresAt);

  emitOk({
    command: "login",
    status: "ok",
    baseUrl,
    expiresAt: result.expiresAt ?? null,
    credentialsFile: stored.file,
    hint:
      "Token sicher gespeichert (chmod 600). upload/publish nutzen ihn " +
      "automatisch — kein EDU_AUTHORING_TOKEN mehr nötig.",
  });
}

/**
 * Loopback-HTTP-Server, gebunden NUR an 127.0.0.1 (nie aus dem Netz
 * erreichbar). Nimmt einen /callback-Request, prüft den state-Nonce und
 * liefert den Token via Promise.
 */
function startLoopbackServer(expectedState) {
  return new Promise((resolveServer, rejectServer) => {
    let resolveToken;
    let rejectToken;
    const tokenPromise = new Promise((res, rej) => {
      resolveToken = res;
      rejectToken = rej;
    });

    const server = createServer((req, res) => {
      let url;
      try {
        url = new URL(req.url, "http://127.0.0.1");
      } catch {
        res.writeHead(400).end("bad request");
        return;
      }
      if (url.pathname !== "/callback") {
        res.writeHead(404).end("not found");
        return;
      }

      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");
      const tok = url.searchParams.get("token");

      const fail = (pageMsg, errCode) => {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(resultPage("Login fehlgeschlagen", pageMsg));
        rejectToken(new Error(errCode));
      };

      if (error) return fail(`Autorisierung abgelehnt (${error}).`, error);
      if (state !== expectedState)
        return fail(
          "State stimmt nicht — Abbruch aus Sicherheitsgründen.",
          "state_mismatch",
        );
      if (!tok) return fail("Kein Token empfangen.", "no_token");

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        resultPage(
          "Erfolgreich autorisiert ✓",
          "Du kannst dieses Fenster schliessen und ins Terminal zurückkehren.",
        ),
      );
      resolveToken({
        token: tok,
        expiresAt: url.searchParams.get("expiresAt"),
      });
    });

    server.on("error", rejectServer);
    server.listen(0, "127.0.0.1", () => {
      resolveServer({
        port: server.address().port,
        tokenPromise,
        close: () => server.close(),
      });
    });
  });
}

/** Minimaler Bestätigungs-HTML — title/message sind feste, sichere Strings. */
function resultPage(title, message) {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;background:#0f0f10;color:#e8e8e8;
    display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
  .b{max-width:380px;padding:40px;text-align:center}
  h1{font-weight:500;font-size:20px;margin:0 0 12px}
  p{color:#a0a0a0;font-size:14px;line-height:1.5;margin:0}
</style></head>
<body><div class="b"><h1>${title}</h1><p>${message}</p></div></body></html>`;
}

/** Öffnet die URL im Default-Browser (plattformabhängig). Best-effort. */
function openBrowser(url) {
  const platform = process.platform;
  let cmd;
  let args;
  if (platform === "darwin") {
    cmd = "open";
    args = [url];
  } else if (platform === "win32") {
    cmd = "cmd";
    args = ["/c", "start", "", url];
  } else {
    cmd = "xdg-open";
    args = [url];
  }
  try {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.on("error", () => {}); // kein Browser → User hat die URL auf stderr
    child.unref();
  } catch {
    /* Browser konnte nicht geöffnet werden — URL steht auf stderr */
  }
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

// ============================================================
// Credential-Store (~/.edu-platform/credentials.json, pro baseUrl)
// ============================================================

function credentialsFile() {
  return join(homedir(), ".edu-platform", "credentials.json");
}

function readCredentials() {
  try {
    return JSON.parse(readFileSync(credentialsFile(), "utf8"));
  } catch {
    return {};
  }
}

/** Liest den gespeicherten Token für eine baseUrl; abgelaufen ⇒ undefined. */
function loadStoredToken(forBaseUrl) {
  const entry = readCredentials()[trimSlash(forBaseUrl)];
  if (!entry?.token) return undefined;
  if (entry.expiresAt && Date.parse(entry.expiresAt) <= Date.now()) {
    return undefined; // abgelaufen → Caller sagt „login"
  }
  return entry.token;
}

async function storeToken(forBaseUrl, tok, expiresAt) {
  const dir = join(homedir(), ".edu-platform");
  await mkdir(dir, { recursive: true });
  const file = credentialsFile();
  const store = readCredentials();
  store[trimSlash(forBaseUrl)] = {
    token: tok,
    expiresAt: expiresAt ?? null,
    savedAt: new Date().toISOString(),
  };
  await writeFile(file, JSON.stringify(store, null, 2), { mode: 0o600 });
  await chmod(file, 0o600); // falls die Datei schon existierte
  return { file };
}

// ============================================================
// HTTP-Helpers
// ============================================================

async function postJson(path, payload) {
  return fetch(joinUrl(baseUrl, path), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

/**
 * Mapped Server-Antworten auf Exit-Codes + JSON-Output. Bei `ok: true`
 * ruft `onOk(body)` für das spezifische Kommando-Mapping.
 */
async function handleResponse(res, onOk) {
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { _raw: text };
  }

  if (res.ok && body.ok) {
    await onOk(body);
    return;
  }

  // Fehler-Mapping. Auf Token-Leak in `body` brauchen wir nicht zu achten —
  // der Server gibt den Token nicht zurück; trotzdem nie zusätzliche Headers
  // mit dem Token in den Output schreiben.
  const errorCode = body.error ?? `http_${res.status}`;
  const retryAfter = res.headers.get("Retry-After") ?? body.retry_after_sec;

  switch (res.status) {
    case 401:
      emitError(
        EXIT_AUTH,
        errorCode,
        errorCode === "invalid_token"
          ? "Der Authoring-Token ist ungültig, abgelaufen oder widerrufen. Führe `node client.mjs login` aus (öffnet den Browser) — der neue Token wird automatisch gespeichert."
          : "Nicht eingeloggt — Token fehlt oder Header wurde nicht akzeptiert.",
        body,
      );
      break;
    case 403:
      emitError(
        EXIT_ROLE,
        errorCode,
        `Rolle reicht nicht: erwartet "${body.required ?? "curator|admin"}", aktuell "${body.got ?? "unbekannt"}".`,
        body,
      );
      break;
    case 409:
      emitError(
        EXIT_CONFLICT,
        errorCode,
        `Version-Konflikt für Course "${body.courseSlug ?? "?"}": Bundle-Version "${body.expected ?? "?"}" passt nicht zur Server-Version "${body.current ?? "?"}". NICHT blind überschreiben — User fragen, ob mit aktueller Server-Version neu gestartet werden soll.`,
        body,
      );
      break;
    case 413:
      emitError(
        EXIT_TOO_LARGE,
        errorCode,
        `Bundle zu groß: ${body.got_bytes ?? "?"} > Limit ${body.max_bytes ?? "?"}.`,
        body,
      );
      break;
    case 429:
      emitError(
        EXIT_RATE_LIMITED,
        errorCode,
        `Rate-Limit erreicht (${body.limit ?? "?"}). Retry-After: ${retryAfter ?? "?"} s.`,
        body,
      );
      break;
    case 400:
      emitError(
        EXIT_BAD_REQUEST,
        errorCode,
        body.detail
          ? `Bad-Request: ${errorCode} — ${body.detail}`
          : `Bad-Request: ${errorCode}`,
        body,
      );
      break;
    case 404:
      emitError(EXIT_BAD_REQUEST, errorCode, `Not found: ${errorCode}`, body);
      break;
    case 500:
    default:
      emitError(
        EXIT_SERVER,
        errorCode,
        body.detail ?? `Server-Fehler (HTTP ${res.status}).`,
        body,
      );
  }
}

// ============================================================
// Version-Write-back ins course.mdx-Frontmatter
// ============================================================

/**
 * Schaut in der Server-Antwort nach der neuen Course-Version. Der Server
 * liefert sie als `summary.version` (ImportSummary.version, siehe
 * lib/authoring/types.ts) — das ist das Self-Identifying-Bundle-Token für
 * den Optimistic-Locking-Round-Trip. Die Fallbacks sind defensiv, falls
 * sich die Response-Form je ändert. Findet sich nichts: kein Write-back
 * (Skill warnt den User → Konflikt-Schutz wäre dann inaktiv).
 */
function extractServerVersion(body) {
  return (
    body?.summary?.version ??
    body?.version ??
    body?.course?.version ??
    null
  );
}

async function writeVersionToFrontmatter(bundleRoot, newVersion) {
  const coursePath = join(bundleRoot, "course.mdx");
  try {
    const original = await readFile(coursePath, "utf8");
    const updated = upsertFrontmatterField(original, "version", newVersion);
    if (updated === original) {
      return { applied: false, reason: "frontmatter_unchanged", version: newVersion };
    }
    await writeFile(coursePath, updated, "utf8");
    return { applied: true, version: newVersion, file: coursePath };
  } catch (err) {
    return { applied: false, reason: "write_failed", detail: err.message };
  }
}

/**
 * Setzt/ersetzt ein Frontmatter-Feld im YAML-Block am Datei-Anfang.
 * Bewusst minimaler Eigen-Parser — keine externe YAML-Dep, und der
 * Wert ist ein simpler String (Server-generiert, kein User-Input).
 */
function upsertFrontmatterField(source, key, value) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const quoted = `"${String(value).replace(/"/g, '\\"')}"`;
  const newLine = `${key}: ${quoted}`;

  if (!match) {
    return `---\n${newLine}\n---\n\n${source}`;
  }

  const fmBody = match[1];
  const fieldRe = new RegExp(`^${escapeRegex(key)}\\s*:.*$`, "m");

  const newFmBody = fieldRe.test(fmBody)
    ? fmBody.replace(fieldRe, newLine)
    : `${fmBody}\n${newLine}`;

  return source.replace(match[0], `---\n${newFmBody}\n---\n`);
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ============================================================
// Output-Helpers (nie Token loggen, immer JSON)
// ============================================================

function emitOk(payload) {
  console.log(JSON.stringify({ ok: true, ...payload }, null, 2));
  process.exit(EXIT_OK);
}

function emitError(exitCode, errorCode, message, serverBody) {
  // Schutz vor versehentlichem Token-Echo: filter `Authorization`-Spuren raus.
  const safe = scrubSecrets(serverBody);
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: errorCode,
        message,
        server: safe ?? null,
      },
      null,
      2,
    ),
  );
  process.exit(exitCode);
}

function failLocal(message) {
  console.error(JSON.stringify({ ok: false, error: "local_error", message }, null, 2));
  process.exit(EXIT_LOCAL);
}

function scrubSecrets(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const json = JSON.stringify(obj);
  // Defensiv: der aktuelle Token darf in keinem Output landen.
  if (token && json.includes(token)) {
    return JSON.parse(json.replaceAll(token, "<REDACTED>"));
  }
  return obj;
}

// ============================================================
// Sonstige Helpers
// ============================================================

function joinUrl(base, path) {
  if (!path) return base;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${trimSlash(base)}${path.startsWith("/") ? path : `/${path}`}`;
}

function trimSlash(s) {
  return s ? s.replace(/\/+$/, "") : s;
}

function parseFlags(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--base-url" && argv[i + 1]) {
      out.baseUrl = argv[++i];
    } else if (a === "--course-slug" && argv[i + 1]) {
      out.courseSlug = argv[++i];
    } else if (a === "--out" && argv[i + 1]) {
      out.out = argv[++i];
    } else if (a === "--force") {
      out.force = true;
    } else if (a === "--no-children") {
      out.noChildren = true;
    } else if (a.startsWith("--")) {
      // unbekannte Flags ignorieren, damit zukünftige Erweiterungen nicht hart brechen
    } else {
      out._.push(a);
    }
  }
  return out;
}

function printUsage() {
  const usage = `client.mjs — authentifizierter Client zur EDU-Platform-Authoring-API

USAGE
  node client.mjs login                                   (öffnet Browser, holt Token)
  node client.mjs checkout <slug>          [--out <dir>] [--force]
  node client.mjs upload   <bundle-folder> [--course-slug <slug>]
  node client.mjs publish  <courseId>      [--no-children]

ENV
  EDU_PLATFORM_BASE_URL   z.B. https://verstande.ch  (oder --base-url)
  EDU_AUTHORING_TOKEN     cat_… optional — nach "login" aus
                          ~/.edu-platform/credentials.json gelesen.
                          Gesetzte Env-Var schlägt den Store.

OPTIONS
  --base-url <url>     Plattform-URL überschreiben (statt env)
  --course-slug <slug> Slug überschreiben (default: Bundle-Folder-Name)
  --out <dir>          checkout: Zielordner (default: aktuelles Verzeichnis)
  --force              checkout: existierenden Bundle-Ordner überschreiben
  --no-children        Publish nur den Course, nicht Sections/Lessons

EXIT-CODES
  0   ok          | 1   server (500)    | 2   auth (401)
  3   role (403)  | 4   bad request     | 5   local error
  9   conflict    | 13  bundle too large| 29  rate limited
`;
  console.error(usage);
}

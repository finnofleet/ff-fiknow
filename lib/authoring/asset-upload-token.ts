/**
 * Presigned-Upload-Token (ADR 0004 — `request_asset_upload_url`).
 *
 * Schließt den Auth-Gap des Out-of-Band-Uploads: die MCP-Verbindung trägt das
 * langlebige `cat_`-Token, die Shell des Agents aber NICHT. Statt das `cat_`-
 * Token in die Shell zu reichen, prägt das (cat_-authentifizierte) MCP-Tool eine
 * **kurzlebige, eng gescopte Capability** und legt sie in die Upload-URL. Der
 * Agent curlt nur noch dagegen — kein separates Credential nötig.
 *
 * Eigenschaften (bewusst stateless — kein DB-/Nonce-Store):
 *   - HMAC-SHA256 über `{s: slug, p: path, exp}` mit `PAYLOAD_SECRET`.
 *   - Kurze TTL (Default 5 Min) → das Replay-Fenster ist eng.
 *   - Auf EXAKT einen courseSlug + Pfad gescoped → das Token kann nur dieses
 *     eine Asset stagen, nichts anderes.
 *   - Stagen ist ohnehin idempotent + content-adressiert; der Import prüft den
 *     `sha256` erneut. Ein Replay könnte also nur denselben Pfad mit (anderen)
 *     Bytes bestücken, die beim Import per Hash auffielen.
 *
 * Single-use wäre die einzige zusätzliche Härtung, bräuchte aber einen
 * Nonce-Store; bewusst nicht gebaut (siehe ADR-Konsequenzen).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const DEFAULT_UPLOAD_TTL_SEC = 300; // 5 Minuten

function secret(): string {
  const s = process.env.PAYLOAD_SECRET;
  if (!s || s.trim().length === 0) {
    throw new Error(
      "Upload-Token: PAYLOAD_SECRET ist nicht gesetzt — kann nicht signieren.",
    );
  }
  return s;
}

type TokenPayload = { s: string; p: string; exp: number };

function sign(payloadB64: string): string {
  return createHmac("sha256", secret()).update(payloadB64).digest("base64url");
}

/** Prägt ein Upload-Token für genau (slug, path), gültig für `ttlSec` Sekunden. */
export function mintUploadToken(
  slug: string,
  path: string,
  ttlSec: number = DEFAULT_UPLOAD_TTL_SEC,
): { token: string; expiresAt: number } {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const payload: TokenPayload = { s: slug, p: path, exp };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return { token: `${payloadB64}.${sign(payloadB64)}`, expiresAt: exp };
}

// Reservierter Scope für Bundle-Upload-Tokens. Beginnt mit '#', kann also nie
// ein Asset-Pfad sein (die starten mit 'assets/') → keine Verwechslung.
const BUNDLE_SCOPE = "#bundle";

/** Prägt ein Token für den ZIP-Bundle-Upload eines Kurses (ADR 0004). */
export function mintBundleUploadToken(
  slug: string,
  ttlSec: number = DEFAULT_UPLOAD_TTL_SEC,
): { token: string; expiresAt: number } {
  return mintUploadToken(slug, BUNDLE_SCOPE, ttlSec);
}

/** Verifiziert ein Bundle-Upload-Token gegen den erwarteten Kurs-Slug. */
export function verifyBundleUploadToken(
  token: string,
  expectedSlug: string,
): UploadTokenResult {
  return verifyUploadToken(token, expectedSlug, BUNDLE_SCOPE);
}

export type UploadTokenResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Verifiziert ein Upload-Token gegen den erwarteten (slug, path). Prüft
 * Signatur (timing-safe), Ablauf und exakten Scope. Gibt nie Details preis, die
 * einem Angreifer helfen (nur grobe `reason`).
 */
export function verifyUploadToken(
  token: string,
  expectedSlug: string,
  expectedPath: string,
): UploadTokenResult {
  const dot = token.indexOf(".");
  if (dot <= 0) return { ok: false, reason: "malformed" };
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);

  const expected = sign(payloadB64);
  const a = Buffer.from(sigB64);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad_signature" };
  }

  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (payload.exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: "expired" };
  }
  if (payload.s !== expectedSlug || payload.p !== expectedPath) {
    return { ok: false, reason: "scope_mismatch" };
  }
  return { ok: true };
}

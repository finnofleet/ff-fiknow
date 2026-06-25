/**
 * Signierte Cookies für den OIDC-Flow — via WebCrypto (HMAC-SHA256).
 *
 * Bewusst WebCrypto (`globalThis.crypto.subtle`) statt `node:crypto`: dieselbe
 * Logik läuft sowohl im Node-Runtime (Routes, getServerIdentity) ALS AUCH im
 * Edge-Runtime (Middleware/proxy.ts). Kein `node:crypto`, kein `Buffer`.
 *
 * Zwei Cookies:
 *   - ep_session  App-Session nach Login. Nur Identity-Snapshot
 *                 (sub/email/name/role) + exp — KEINE Access-/Refresh-Tokens
 *                 (kleiner Cookie, keine Token-Leakage; Rolle wird beim Login
 *                 aus den Keycloak-Claims gemappt und ist serverseitig über
 *                 profiles ohnehin autoritativ).
 *   - ep_oidc_tx  Kurzlebiger Transient-State (state, nonce, PKCE-verifier,
 *                 next) zwischen Login-Start und Callback.
 *
 * Beide HMAC-signiert (Integrität/Unfälschbarkeit) und httpOnly. crypto.subtle
 * .verify vergleicht die Signatur konstant-zeitig.
 */
import type { Role } from "@/lib/auth/roles";

export const SESSION_COOKIE = "ep_session";
export const TX_COOKIE = "ep_oidc_tx";

const TX_MAX_AGE_SEC = 600; // 10 min
export const TX_COOKIE_MAX_AGE = TX_MAX_AGE_SEC;

export type SessionPayload = {
  sub: string;
  email: string | null;
  /** Ob der IdP die E-Mail verifiziert hat — gate fürs Payload-Account-Linking. */
  emailVerified: boolean;
  name: string | null;
  role: Role;
  /** Unix-Sekunden. */
  exp: number;
};

export type TxPayload = {
  state: string;
  nonce: string;
  codeVerifier: string;
  /** Validierter relativer Redirect nach Login (safeNextPath). */
  next: string;
  exp: number;
};

// ============================================================
// base64url ohne Buffer (Edge + Node)
// ============================================================

function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function strToB64url(s: string): string {
  return bytesToB64url(new TextEncoder().encode(s));
}

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ============================================================
// HMAC-SHA256 via WebCrypto
// ============================================================

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function sign(body: string, secret: string): Promise<string> {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return bytesToB64url(new Uint8Array(sig));
}

async function verify(
  body: string,
  sigB64url: string,
  secret: string,
): Promise<boolean> {
  const key = await hmacKey(secret);
  try {
    return await crypto.subtle.verify(
      "HMAC",
      key,
      b64urlToBytes(sigB64url),
      new TextEncoder().encode(body),
    );
  } catch {
    return false;
  }
}

// ============================================================
// Signiertes JSON: base64url(payload).base64url(hmac)
// ============================================================

async function encode(payload: object, secret: string): Promise<string> {
  const body = strToB64url(JSON.stringify(payload));
  return `${body}.${await sign(body, secret)}`;
}

async function decode<T extends { exp: number }>(
  raw: string | undefined,
  secret: string,
): Promise<T | null> {
  if (!raw) return null;
  const dot = raw.indexOf(".");
  if (dot <= 0) return null;
  const body = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);

  if (!(await verify(body, sig, secret))) return null;

  let parsed: T;
  try {
    parsed = JSON.parse(new TextDecoder().decode(b64urlToBytes(body))) as T;
  } catch {
    return null;
  }

  if (typeof parsed.exp !== "number" || parsed.exp <= nowSec()) return null;
  return parsed;
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

// ============================================================
// Session-Cookie
// ============================================================

export async function signSession(
  identity: {
    sub: string;
    email: string | null;
    emailVerified: boolean;
    name: string | null;
    role: Role;
  },
  secret: string,
  maxAgeSec: number,
): Promise<string> {
  const payload: SessionPayload = {
    sub: identity.sub,
    email: identity.email,
    emailVerified: identity.emailVerified,
    name: identity.name,
    role: identity.role,
    exp: nowSec() + maxAgeSec,
  };
  return encode(payload, secret);
}

export function verifySession(
  raw: string | undefined,
  secret: string,
): Promise<SessionPayload | null> {
  return decode<SessionPayload>(raw, secret);
}

// ============================================================
// Transient-State-Cookie
// ============================================================

export async function signTx(
  tx: Omit<TxPayload, "exp">,
  secret: string,
): Promise<string> {
  const payload: TxPayload = { ...tx, exp: nowSec() + TX_MAX_AGE_SEC };
  return encode(payload, secret);
}

export function verifyTx(
  raw: string | undefined,
  secret: string,
): Promise<TxPayload | null> {
  return decode<TxPayload>(raw, secret);
}

// ============================================================
// Cookie-Optionen (httpOnly, Secure in Prod, SameSite=Lax)
// ============================================================
//
// SameSite=Lax (nicht Strict): der Rücksprung vom IdP ist eine top-level
// GET-Navigation zu /auth/oidc/callback — Lax sendet die Cookies dabei mit,
// Strict würde den tx-Cookie unterschlagen und den Flow brechen.

export function cookieOptions(maxAgeSec: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSec,
  };
}

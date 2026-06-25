/**
 * Scoped Course-Authoring-Token (ADR 0001, Sicherheits-Anforderung 5).
 *
 * Mint/Verify/List/Revoke für Bearer-Tokens, mit denen der Plugin-/CLI-Client
 * die Authoring-Endpoints anspricht — statt Browser-Cookie oder Service-Key.
 *
 * Sicherheitseigenschaften:
 *   - Klartext wird NIE gespeichert, nur `token_hash` (SHA-256 hex). Der
 *     Klartext existiert genau einmal: in der Mint-Response.
 *   - 256 Bit Entropie (randomBytes(32)) → schneller Hash ist korrekt; die
 *     Verifikation ist ein indizierter DB-Equality-Lookup (kein JS-Vergleich,
 *     also kein Timing-Leak unsererseits).
 *   - Die ROLLE wird nicht in den Token gebacken, sondern bei jeder Nutzung
 *     frisch aus profiles gelesen (siehe authoring-auth.ts) → Rollenentzug
 *     wirkt sofort, ohne den Token widerrufen zu müssen.
 *   - Widerrufbar (`revoked_at`), kurze TTL (`expires_at`).
 */
import { createHash, randomBytes } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { authoringTokens } from "@/lib/db/schema";

/** Prefix macht Tokens in Logs/Configs erkennbar (course-authoring-token). */
const TOKEN_PREFIX = "cat_";
const TOKEN_BYTES = 32; // 256 Bit Entropie

export const DEFAULT_TTL_HOURS = 12;
export const MAX_TTL_HOURS = 24 * 7; // 7 Tage

/** SHA-256-Hex des Klartexts. Einziges, was persistiert wird. */
export function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext, "utf8").digest("hex");
}

/** Begrenzt die gewünschte TTL auf [1h .. MAX]; ungültig → Default. */
export function clampTtlHours(hours: number | undefined): number {
  if (hours == null || !Number.isFinite(hours) || hours <= 0) {
    return DEFAULT_TTL_HOURS;
  }
  return Math.min(Math.floor(hours), MAX_TTL_HOURS);
}

export interface MintedToken {
  id: string;
  /** Klartext — NUR hier, nie wieder abrufbar. */
  token: string;
  expiresAt: Date;
  ttlHours: number;
}

/**
 * Erzeugt einen neuen Token für `userId`. Der Aufrufer MUSS vorher per echter
 * Session (nicht per Token!) authentifiziert sein — siehe tokens-Route.
 */
export async function mintAuthoringToken(opts: {
  userId: string;
  label?: string | null;
  ttlHours?: number;
}): Promise<MintedToken> {
  const ttlHours = clampTtlHours(opts.ttlHours);
  const token = TOKEN_PREFIX + randomBytes(TOKEN_BYTES).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + ttlHours * 3_600_000);

  const [row] = await db
    .insert(authoringTokens)
    .values({
      tokenHash,
      userId: opts.userId,
      label: opts.label?.trim() || null,
      expiresAt,
    })
    .returning({ id: authoringTokens.id, expiresAt: authoringTokens.expiresAt });

  return { id: row.id, token, expiresAt: row.expiresAt, ttlHours };
}

/**
 * Prüft einen vorgelegten Bearer-Klartext. Gibt die `userId` des Besitzers
 * zurück, wenn der Token existiert, nicht widerrufen und nicht abgelaufen ist;
 * sonst `null`. Aktualisiert `last_used_at` (best effort).
 *
 * Achtung: prüft NICHT die Rolle — das macht der Aufrufer (authoring-auth.ts)
 * frisch gegen profiles.
 */
export async function verifyAuthoringToken(
  plaintext: string,
): Promise<{ userId: string } | null> {
  if (!plaintext || !plaintext.startsWith(TOKEN_PREFIX)) return null;

  const tokenHash = hashToken(plaintext);
  const [row] = await db
    .select({
      id: authoringTokens.id,
      userId: authoringTokens.userId,
      expiresAt: authoringTokens.expiresAt,
      revokedAt: authoringTokens.revokedAt,
    })
    .from(authoringTokens)
    .where(eq(authoringTokens.tokenHash, tokenHash))
    .limit(1);

  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt.getTime() <= Date.now()) return null;

  await db
    .update(authoringTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(authoringTokens.id, row.id));

  return { userId: row.userId };
}

export interface TokenListItem {
  id: string;
  label: string | null;
  createdAt: Date;
  expiresAt: Date;
  lastUsedAt: Date | null;
  revoked: boolean;
  expired: boolean;
}

/** Listet die Tokens eines Users — OHNE Hash/Klartext. */
export async function listAuthoringTokens(
  userId: string,
): Promise<TokenListItem[]> {
  const rows = await db
    .select({
      id: authoringTokens.id,
      label: authoringTokens.label,
      createdAt: authoringTokens.createdAt,
      expiresAt: authoringTokens.expiresAt,
      lastUsedAt: authoringTokens.lastUsedAt,
      revokedAt: authoringTokens.revokedAt,
    })
    .from(authoringTokens)
    .where(eq(authoringTokens.userId, userId));

  const now = Date.now();
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
    lastUsedAt: r.lastUsedAt,
    revoked: r.revokedAt != null,
    expired: r.expiresAt.getTime() <= now,
  }));
}

/**
 * Widerruft einen Token — nur, wenn er dem `userId` gehört und noch nicht
 * widerrufen ist. Gibt `true` zurück, wenn tatsächlich etwas widerrufen wurde.
 */
export async function revokeAuthoringToken(
  userId: string,
  id: string,
): Promise<boolean> {
  const revoked = await db
    .update(authoringTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(authoringTokens.id, id),
        eq(authoringTokens.userId, userId),
        isNull(authoringTokens.revokedAt),
      ),
    )
    .returning({ id: authoringTokens.id });

  return revoked.length > 0;
}

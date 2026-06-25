"use client";

/**
 * AccessTokensManager — Self-Service für Personal Access Tokens.
 *
 * Tokens werden für MCP-/CLI-Authoring genutzt und als
 * `Authorization: Bearer cat_…` in der MCP-Client-Config eingetragen.
 *
 * API-Verträge (read-only, keine Backend-Änderungen hier):
 *   GET    /api/authoring/tokens        → { ok, tokens }
 *   POST   /api/authoring/tokens        → { ok, id, token, expiresAt, ttlHours }
 *   DELETE /api/authoring/tokens/<id>   → { ok, revoked, id }
 */
import { useState, useTransition } from "react";

import styles from "./page.module.css";

export type TokenView = {
  id: string;
  label: string | null;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  revoked: boolean;
  expired: boolean;
};

type MintResult = {
  id: string;
  /** Klartext-Token — nur in dieser Response, danach weg. */
  token: string;
  expiresAt: string;
  ttlHours: number;
};

// ============================================================
// Hilfsfunktionen
// ============================================================

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("de-CH");
}

function statusLabel(t: TokenView): string {
  if (t.revoked) return "widerrufen";
  if (t.expired) return "abgelaufen";
  return "aktiv";
}

function statusMod(t: TokenView): string {
  if (t.revoked) return styles.tokenBadgeRevoked;
  if (t.expired) return styles.tokenBadgeExpired;
  return styles.tokenBadgeActive;
}

// ============================================================
// Haupt-Komponente
// ============================================================

export function AccessTokensManager({
  initialTokens,
}: {
  initialTokens: TokenView[];
}) {
  const [tokens, setTokens] = useState<TokenView[]>(initialTokens);
  const [minted, setMinted] = useState<MintResult | null>(null);
  const [copied, setCopied] = useState(false);

  // Mint-Formular-State
  const [label, setLabel] = useState("");
  const [ttlHours, setTtlHours] = useState<number>(12);
  const [mintErr, setMintErr] = useState<string | null>(null);
  const [mintPending, startMintTransition] = useTransition();

  // Widerruf-State: id → "confirm" | "pending"
  const [revokeState, setRevokeState] = useState<
    Record<string, "confirm" | "pending">
  >({});
  const [revokeErr, setRevokeErr] = useState<string | null>(null);

  // ----------------------------------------------------------
  // Token minten
  // ----------------------------------------------------------

  function handleMint(e: React.FormEvent) {
    e.preventDefault();
    setMintErr(null);
    setMinted(null);
    setCopied(false);

    startMintTransition(async () => {
      try {
        const res = await fetch("/api/authoring/tokens", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label: label.trim() || undefined,
            ttlHours,
          }),
        });
        const json = (await res.json()) as
          | ({ ok: true } & MintResult)
          | { ok: false; error: string };

        if (!json.ok) {
          const errMap: Record<string, string> = {
            invalid_label: "Label ungültig (max. 200 Zeichen).",
            invalid_ttl: "Ungültige Gültigkeitsdauer.",
            rate_limited: "Zu viele Token-Erzeugungen — kurz warten.",
            insufficient_role: "Nicht berechtigt.",
          };
          setMintErr(errMap[json.error] ?? `Fehler: ${json.error}`);
          return;
        }

        const newMint: MintResult = {
          id: json.id,
          token: json.token,
          expiresAt: json.expiresAt,
          ttlHours: json.ttlHours,
        };

        // Neues Token oben in die Liste einfügen (als aktiv, nicht expired/revoked)
        const newTokenView: TokenView = {
          id: json.id,
          label: label.trim() || null,
          createdAt: new Date().toISOString(),
          expiresAt: json.expiresAt,
          lastUsedAt: null,
          revoked: false,
          expired: false,
        };
        setTokens((prev) => [newTokenView, ...prev]);
        setMinted(newMint);
        setLabel("");
        setTtlHours(12);
      } catch {
        setMintErr("Netzwerkfehler — bitte erneut versuchen.");
      }
    });
  }

  // ----------------------------------------------------------
  // Token widerrufen
  // ----------------------------------------------------------

  function handleRevokeClick(id: string) {
    // Erster Klick → Bestätigung anfordern
    if (!revokeState[id]) {
      setRevokeState((prev) => ({ ...prev, [id]: "confirm" }));
      return;
    }
    // Zweiter Klick → Widerruf ausführen
    setRevokeErr(null);
    setRevokeState((prev) => ({ ...prev, [id]: "pending" }));

    fetch(`/api/authoring/tokens/${id}`, { method: "DELETE" })
      .then(async (res) => {
        const json = (await res.json()) as
          | { ok: true; revoked: boolean; id: string }
          | { ok: false; error: string };

        if (!json.ok) {
          setRevokeErr(
            json.error === "token_not_found"
              ? "Token nicht gefunden — wurde möglicherweise bereits widerrufen."
              : `Widerruf fehlgeschlagen: ${json.error}`,
          );
          setRevokeState((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
          return;
        }

        // Token in der lokalen Liste als widerrufen markieren
        setTokens((prev) =>
          prev.map((t) => (t.id === id ? { ...t, revoked: true } : t)),
        );
        setRevokeState((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      })
      .catch(() => {
        setRevokeErr("Netzwerkfehler — bitte erneut versuchen.");
        setRevokeState((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      });
  }

  function handleRevokeCancelClick(id: string) {
    setRevokeState((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  // ----------------------------------------------------------
  // Klartext kopieren
  // ----------------------------------------------------------

  async function handleCopy() {
    if (!minted) return;
    try {
      await navigator.clipboard.writeText(minted.token);
      setCopied(true);
    } catch {
      // Fallback: nichts tun, Nutzer kann manuell kopieren
    }
  }

  // ----------------------------------------------------------
  // Render
  // ----------------------------------------------------------

  return (
    <div>
      {/* Nutzungshinweis */}
      <p className={styles.tokenHint}>
        Tokens ermöglichen MCP-/CLI-Clients den Zugriff auf die Authoring-API —
        ohne Browser-Session. Trage das Token in deiner MCP-Client-Config als
        HTTP-Header ein:
      </p>
      <pre className={styles.tokenSnippet}>
        {`"headers": {\n  "Authorization": "Bearer cat_…"\n}`}
      </pre>

      {/* Klartext-Anzeige nach Mint */}
      {minted && (
        <div className={styles.tokenRevealBox}>
          <p className={styles.tokenRevealWarn}>
            ⚠ Jetzt kopieren — dieses Token wird nur einmal angezeigt und kann
            danach nicht mehr abgerufen werden.
          </p>
          <div className={styles.tokenRevealRow}>
            <code className={styles.tokenRevealCode}>{minted.token}</code>
            <button
              type="button"
              className={`btn btn-primary ${styles.tokenCopyBtn}`}
              onClick={() => void handleCopy()}
            >
              {copied ? "Kopiert ✓" : "Kopieren"}
            </button>
          </div>
          <p className={styles.tokenRevealMeta}>
            Gültig bis: {fmt(minted.expiresAt)} · TTL: {minted.ttlHours} h
          </p>
          <button
            type="button"
            className={styles.tokenRevealClose}
            onClick={() => {
              setMinted(null);
              setCopied(false);
            }}
          >
            Schließen
          </button>
        </div>
      )}

      {/* Token-Liste */}
      {tokens.length === 0 ? (
        <p className={styles.tokenEmpty}>Noch keine Tokens vorhanden.</p>
      ) : (
        <ul className={styles.tokenList}>
          {tokens.map((t) => {
            const inactive = t.revoked || t.expired;
            const state = revokeState[t.id];
            return (
              <li
                key={t.id}
                className={`${styles.tokenRow} ${inactive ? styles.tokenRowDim : ""}`}
              >
                <div className={styles.tokenRowMain}>
                  <span className={styles.tokenLabel}>
                    {t.label ?? <em>(ohne Label)</em>}
                  </span>
                  <span className={`${styles.tokenBadge} ${statusMod(t)}`}>
                    {statusLabel(t)}
                  </span>
                </div>
                <dl className={styles.tokenMeta}>
                  <div className={styles.tokenMetaItem}>
                    <dt>Erstellt</dt>
                    <dd>{fmt(t.createdAt)}</dd>
                  </div>
                  <div className={styles.tokenMetaItem}>
                    <dt>Läuft ab</dt>
                    <dd>{fmt(t.expiresAt)}</dd>
                  </div>
                  <div className={styles.tokenMetaItem}>
                    <dt>Zuletzt genutzt</dt>
                    <dd>{t.lastUsedAt ? fmt(t.lastUsedAt) : "—"}</dd>
                  </div>
                </dl>
                {!inactive && (
                  <div className={styles.tokenRowActions}>
                    {state === "confirm" ? (
                      <>
                        <button
                          type="button"
                          className={styles.dangerBtn}
                          onClick={() => handleRevokeClick(t.id)}
                        >
                          Sicher widerrufen?
                        </button>
                        <button
                          type="button"
                          className={styles.tokenCancelBtn}
                          onClick={() => handleRevokeCancelClick(t.id)}
                        >
                          Abbrechen
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className={styles.dangerBtn}
                        disabled={state === "pending"}
                        onClick={() => handleRevokeClick(t.id)}
                      >
                        {state === "pending" ? "Widerrufe…" : "Widerrufen"}
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {revokeErr && <p className={styles.formErr}>{revokeErr}</p>}

      {/* Token-Mint-Formular */}
      <form
        onSubmit={(e) => handleMint(e)}
        className={`${styles.subForm} ${styles.tokenMintForm}`}
      >
        <h4 className={styles.tokenMintHd}>Token erzeugen</h4>
        <label className={styles.field}>
          <span>Label (optional)</span>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={200}
            placeholder="z. B. «Cursor MCP» oder «CI-Pipeline»"
            className={styles.input}
            disabled={mintPending}
            autoComplete="off"
          />
        </label>
        <label className={styles.field}>
          <span>Gültigkeitsdauer</span>
          <select
            value={ttlHours}
            onChange={(e) => setTtlHours(Number(e.target.value))}
            className={styles.input}
            disabled={mintPending}
          >
            <option value={12}>12 Stunden</option>
            <option value={24}>24 Stunden</option>
            <option value={168}>7 Tage</option>
          </select>
        </label>
        <div className={styles.formActions}>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={mintPending}
          >
            {mintPending ? "Erzeuge…" : "Token erzeugen"}
          </button>
          {mintErr && <span className={styles.formErr}>{mintErr}</span>}
        </div>
      </form>
    </div>
  );
}

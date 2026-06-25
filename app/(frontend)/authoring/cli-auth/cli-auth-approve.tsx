"use client";

import { useState } from "react";

import styles from "./cli-auth.module.css";

/**
 * Der Autorisierungs-Schritt im Browser. Der eingeloggte Mensch klickt
 * bewusst „Autorisieren" — DAS ist die Privilege-Boundary: kein Token fliesst
 * ohne menschliche Geste. On-Click wird über die bestehende Session-only-Route
 * `/api/authoring/tokens` ein Token gemintet (same-origin → Cookie fährt mit)
 * und an den serverseitig validierten Loopback zurückgereicht.
 */
export function CliAuthApprove({
  redirect,
  state,
  email,
}: {
  redirect: string;
  state: string;
  email: string | null;
}) {
  const [status, setStatus] = useState<"idle" | "working" | "error" | "done">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    setStatus("working");
    setError(null);
    try {
      const res = await fetch("/api/authoring/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          label: "CLI login (client.mjs)",
          ttlHours: 168, // 7 Tage (= MAX_TTL_HOURS); Re-Login ist ein Klick.
        }),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        token?: string;
        expiresAt?: string;
        error?: string;
      };
      if (!res.ok || !body.ok || !body.token) {
        setStatus("error");
        setError(body.error ?? `Mint fehlgeschlagen (HTTP ${res.status}).`);
        return;
      }
      // Token an den Loopback (serverseitig als 127.0.0.1/localhost validiert).
      const url = new URL(redirect);
      url.searchParams.set("token", body.token);
      url.searchParams.set("state", state);
      if (body.expiresAt) url.searchParams.set("expiresAt", body.expiresAt);
      setStatus("done");
      window.location.href = url.toString();
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function deny() {
    // Loopback informieren, damit das CLI nicht ins Timeout läuft.
    try {
      const url = new URL(redirect);
      url.searchParams.set("error", "access_denied");
      url.searchParams.set("state", state);
      window.location.href = url.toString();
    } catch {
      /* noop — Loopback war schon validiert */
    }
  }

  return (
    <div className={styles.card}>
      <h1 className={styles.title}>CLI autorisieren</h1>
      <p className={styles.lede}>
        Ein lokales Tool (<code>client.mjs login</code>) möchte einen
        Authoring-Token für dein Konto{" "}
        <strong>{email ?? "(eingeloggt)"}</strong>. Der Token erlaubt Upload
        und Publish von Kursen — genau wie diese Browser-Sitzung.
      </p>

      <p className={styles.hint}>
        Nur autorisieren, wenn du den Login gerade selbst im Terminal gestartet
        hast.
      </p>

      {status === "error" && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.primary}
          onClick={approve}
          disabled={status === "working" || status === "done"}
        >
          {status === "working"
            ? "Autorisiere…"
            : status === "done"
              ? "Weitergeleitet…"
              : "Autorisieren"}
        </button>
        <button
          type="button"
          className={styles.secondary}
          onClick={deny}
          disabled={status === "working" || status === "done"}
        >
          Abbrechen
        </button>
      </div>
    </div>
  );
}

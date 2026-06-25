import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { canManageCourses } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";

import { CliAuthApprove } from "./cli-auth-approve";
import styles from "./cli-auth.module.css";

export const metadata: Metadata = {
  title: "CLI autorisieren",
  // Reiner Maschinen-Handshake — niemals indexieren.
  robots: { index: false, follow: false },
};

/**
 * CLI-Login-Handshake (Loopback-OAuth, wie `gh auth login`).
 *
 * Das lokale Plugin (`client.mjs login`) startet einen Loopback-Server auf
 * 127.0.0.1:<port>, öffnet diese Seite mit `?redirect=<loopback>&state=<nonce>`
 * und wartet. Hier mintet der eingeloggte Mensch — per Klick — einen
 * Authoring-Token (über die bestehende Session-only-Mint-Route, der
 * Privilege-Chaining-Schutz bleibt also intakt) und der Token wird an den
 * Loopback zurückgereicht. Das CLA bekommt NIE Mint-Rechte.
 *
 * SECURITY-GATE (nicht verhandelbar): `redirect` MUSS ein Loopback sein
 * (http://127.0.0.1|localhost|[::1]:<port>). Sonst wäre dies ein
 * Open-Redirect, der einen Bearer-Token an eine fremde Site ausliefert.
 * Ungültige Parameter erreichen den Mint-Schritt gar nicht erst.
 */

type SearchParams = Promise<{ redirect?: string; state?: string }>;

/** Nur echte Loopback-Ziele zulassen. Alles andere → null (= Abbruch). */
function validateLoopbackRedirect(raw: string | undefined): URL | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:") return null; // Loopback ist immer http
  if (url.username || url.password) return null; // keine eingebetteten Creds
  const host = url.hostname;
  const isLoopback =
    host === "127.0.0.1" || host === "localhost" || host === "[::1]" || host === "::1";
  if (!isLoopback) return null;
  if (!url.port) return null; // ephemerer Port ist Pflicht
  return url;
}

/** state-Nonce: opaker, URL-sicherer String aus dem CLI. */
function isValidState(s: string | undefined): s is string {
  return typeof s === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(s);
}

export default async function CliAuthPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { redirect: redirectRaw, state } = await searchParams;

  // 1. SECURITY-GATE zuerst — ungültige Parameter dürfen nie zum Mint führen.
  const loopback = validateLoopbackRedirect(redirectRaw);
  if (!loopback || !isValidState(state)) {
    return (
      <main className={styles.shell}>
        <div className={styles.card}>
          <h1 className={styles.title}>Ungültige CLI-Anfrage</h1>
          <p className={styles.lede}>
            Diese Seite akzeptiert nur einen <strong>lokalen Loopback</strong> als
            Rückgabeziel (<code>http://127.0.0.1:&lt;port&gt;</code>) zusammen mit
            einem gültigen <code>state</code>. Aus Sicherheitsgründen wird kein
            Token an ein anderes Ziel ausgegeben.
          </p>
          <p className={styles.hint}>
            Starte den Login erneut über{" "}
            <code>node client.mjs login</code> im Plugin-Verzeichnis.
          </p>
        </div>
      </main>
    );
  }

  // 2. Auth — nicht eingeloggt → Login mit Rücksprung hierher.
  const user = await getCurrentUser();
  if (!user) {
    const self = `/authoring/cli-auth?redirect=${encodeURIComponent(
      redirectRaw!,
    )}&state=${encodeURIComponent(state)}`;
    redirect(`/login?redirect=${encodeURIComponent(self)}`);
  }
  if (!canManageCourses(user.role)) {
    return (
      <main className={styles.shell}>
        <div className={styles.card}>
          <h1 className={styles.title}>Keine Berechtigung</h1>
          <p className={styles.lede}>
            Dein Konto (<code>{user.email ?? user.id}</code>) hat keine
            Kurator:innen- oder Admin-Rolle. Authoring-Tokens sind nur für diese
            Rollen verfügbar.
          </p>
        </div>
      </main>
    );
  }

  // 3. Mensch autorisiert per Klick → Token wird an den Loopback gereicht.
  return (
    <main className={styles.shell}>
      <CliAuthApprove
        redirect={loopback.toString()}
        state={state}
        email={user.email}
      />
    </main>
  );
}

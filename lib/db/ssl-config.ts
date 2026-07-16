/**
 * Leitet die SSL-Config für Postgres-Verbindungen aus der DATABASE_URL ab.
 *
 * Hintergrund: postgres-js parst `?sslmode=*` in URLs nicht zuverlässig
 * (insbesondere ist `no-verify` als URL-Parameter nicht offiziell
 * dokumentiert; in v3.4 wird `sslmode=require` ohne weitere Options
 * gegen Self-Signed-Certs mit `DEPTH_ZERO_SELF_SIGNED_CERT` abgelehnt).
 * Wir setzen ssl deshalb programmatisch und konsistent für alle Clients
 * (postgres-js: lib/db/client.ts + payload/auth/gotrue-strategy.ts,
 *  node-postgres-Pool: payload.config.ts).
 *
 * Mapping:
 *   sslmode=disable   → false              (keine Verschlüsselung)
 *   sslmode=verify-*  → true               (TLS mit Cert-Verifikation)
 *   sslmode=require/prefer/allow/no-verify → { rejectUnauthorized: false }
 *     (TLS-Verschlüsselung, aber Cert wird nicht geprüft — passend für
 *      Self-Signed-Certs in privaten Container-Netzwerken wie Jelastic)
 *   kein sslmode      → false              (lokale Dev-Defaults)
 *
 * Das Shape passt sowohl für postgres-js als auch für pg/node-postgres,
 * weil beide am Ende dieselben Node-`tls`-Options entgegennehmen.
 */
export function sslConfigFromUrl(
  url: string,
): false | true | { rejectUnauthorized: boolean } {
  const m = url.match(/[?&]sslmode=([^&]+)/);
  if (!m) return false;
  const mode = m[1].toLowerCase();
  if (mode === "disable") return false;
  if (mode === "verify-full" || mode === "verify-ca") return true;
  return { rejectUnauthorized: false };
}

/**
 * Entfernt `?sslmode=*` aus einer Postgres-URL.
 *
 * node-postgres' Pool/Client parst `sslmode=*` aus dem connectionString
 * und überschreibt damit eine später übergebene `ssl`-Option. Heißt:
 * wenn wir SSL programmatisch setzen wollen, müssen wir sslmode aus
 * der URL strippen, sonst gewinnt das URL-Verhalten und Self-Signed-
 * Certs scheitern weiterhin mit "self-signed certificate"-Error.
 *
 * postgres-js hat diesen Konflikt nicht — dort funktionieren URL-Param
 * und explizite ssl-Option ohne Override-Effekt.
 */
export function stripSslModeFromUrl(url: string): string {
  return url.replace(/([?&])sslmode=[^&]*&?/, (_match, sep) => {
    // Wenn sslmode der einzige Param war, Trenner mit löschen,
    // sonst den vorigen Trenner stehenlassen.
    return sep === "?" ? "?" : "&";
  }).replace(/[?&]$/, "");
}

/**
 * Gate zwischen IdP-Claim-Werten und den App-Tokens der Scope-Achsen
 * `land` + `bu` (ADR 0007 §3).
 *
 * **Warum ein Gate und nicht der Rohwert.** Die Scope-Achsen sind die Basis
 * der Compliance-Sichtbarkeit. Wandert ein IdP-Wert ungeprüft in
 * `profiles.land`/`profiles.bu`, ist jede Umbenennung im IdP (`LUX` → `LU`,
 * Entity-Rename, Merger) ein stiller Sichtbarkeits-Ausfall: der Wert matcht
 * keinen Scope-Grant mehr, die betroffenen Personen verschwinden aus jeder
 * scoped Auswertung — ohne Fehler, ohne Log, mit grünem Dashboard. Das Gate
 * macht daraus einen *erkennbaren* Zustand (`unmapped`) und entkoppelt
 * gleichzeitig das App-Org-Modell vom IdP-Rollout: mehrere IdP-Werte dürfen
 * auf dasselbe App-Token zeigen (relevant für den Merger, bei dem viele
 * Gesellschaften auf DE/CH/LUX zusammenlaufen), und das ist ein
 * Env-Var-Tausch, kein Code-Change (Konvention analog `OIDC_ROLE_MAP`).
 *
 * Bewusst I/O-freies Leaf-Modul (Projekt-Konvention: reine Logik von DB/
 * Payload/Env trennen → ohne Runtime unit-testbar).
 */

/**
 * Ergebnis einer Claim-Auflösung. Drei Zustände statt zwei — `unmapped` ist
 * NICHT dasselbe wie `absent`:
 *
 * - `absent`   — der IdP liefert den Claim nicht. Fix: Claim im IdP befüllen.
 * - `unmapped` — der IdP liefert einen Wert, den die App nicht kennt. Fix:
 *                Map-Eintrag ergänzen. Der Rohwert wird mitgegeben, damit
 *                genau das im Log/Diagnose sichtbar wird.
 * - `mapped`   — auflösbar, `value` ist das App-Token.
 */
export type ClaimResolution =
  | { kind: "mapped"; value: string }
  | { kind: "unmapped"; raw: string }
  | { kind: "absent" };

/**
 * Parst eine Claim-Map im Format `"ff-de-nord:FFDE,ff-de-sued:FFDE"`.
 * Schlüssel = IdP-Claim-Wert (case-insensitiv), Wert = App-Token.
 *
 * Mehrere Schlüssel dürfen auf dasselbe Token zeigen (n:1) — genau das
 * erlaubt es, mehrere Gesellschaften app-seitig zu einer zusammenzufassen,
 * bevor der IdP nachzieht.
 */
export function parseClaimMap(
  raw: string | undefined,
): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  if (!raw) return map;
  for (const pair of raw.split(",")) {
    const sep = pair.indexOf(":");
    if (sep < 0) continue;
    const key = pair.slice(0, sep).trim().toLowerCase();
    const value = pair.slice(sep + 1).trim();
    if (!key || !value) continue;
    map.set(key, value);
  }
  return map;
}

/**
 * Erstes nicht-leeres String-Element eines Claims. Keycloak liefert
 * Attribut-Claims typischerweise als Array (`country: ["DE"]`), ein
 * skalarer String wird aber genauso akzeptiert — welche Form ein Mapper
 * produziert, ist Konfigurationssache im IdP und soll hier nicht brechen.
 */
export function firstClaimValue(
  raw: Record<string, unknown>,
  claim: string,
): string | undefined {
  const value = raw[claim];
  if (typeof value === "string") {
    const t = value.trim();
    return t || undefined;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === "string" && entry.trim()) return entry.trim();
    }
  }
  return undefined;
}

/**
 * Löst einen Claim-Wert gegen die Map auf.
 *
 * Reihenfolge (bewusst):
 *  1. kein Wert → `absent`.
 *  2. Map-Treffer → `mapped`. Die Map hat Vorrang, damit ein IdP-Rename
 *     app-seitig übersetzt werden kann.
 *  3. `isKnownToken`-Treffer → `mapped` (Identität). Ein bekanntes App-Token
 *     bleibt damit IMMER gültig, auch wenn eine Map konfiguriert ist, die es
 *     nicht auflistet — eine Map soll Übersetzungen ergänzen, nie das
 *     eigene Vokabular abschalten.
 *  4. kein Vokabular UND keine Map (`isKnownToken` fehlt, Map leer) →
 *     `mapped` als Pass-Through. So funktioniert eine Achse ohne
 *     geschlossenes Vokabular (Entity: Freitext) sofort, ohne dass erst
 *     jede Gesellschaft eingetragen werden muss. Sobald eine Map gesetzt
 *     ist, gilt sie als Allowlist und alles Unbekannte wird `unmapped`.
 *  5. sonst → `unmapped`.
 */
export function resolveClaim(
  value: string | undefined,
  map: ReadonlyMap<string, string>,
  isKnownToken?: (v: string) => boolean,
): ClaimResolution {
  if (!value) return { kind: "absent" };

  const mapped = map.get(value.toLowerCase());
  if (mapped) return { kind: "mapped", value: mapped };

  if (isKnownToken?.(value)) return { kind: "mapped", value };

  if (!isKnownToken && map.size === 0) return { kind: "mapped", value };

  return { kind: "unmapped", raw: value };
}

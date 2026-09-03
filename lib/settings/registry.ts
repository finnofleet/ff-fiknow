/**
 * Deklaration der Policy-Einstellungen — reine Logik, KEIN I/O.
 *
 * **Geschlossener Schluesselraum, wie bei den Capabilities.** Nur was hier
 * deklariert ist, wird gelesen und angezeigt; ein Fremdeintrag in der Tabelle
 * `settings` bleibt wirkungslos. Damit kann die DB keine Einstellung
 * „erfinden", die der Code nicht auswertet (dieselbe defensive Linie wie
 * `ALL_CAPABILITIES` / `mergeDbCapabilities`).
 *
 * **Und nur, was auch wirklich ausgewertet wird.** Eine deklarierte, aber
 * nirgends konsumierte Einstellung waere eine Attrappe — sie sieht im
 * Admin-UI nach Wirkung aus und hat keine. Neue Keys kommen erst dazu, wenn
 * der Code sie liest.
 *
 * Bewusst I/O-freies Leaf-Modul (Projekt-Konvention) — ohne DB unit-testbar.
 */

/** Woher der aktuell wirksame Wert stammt (Anzeige im Admin-UI). */
export type SettingSource = "db" | "env" | "default";

export type SettingDef = {
  key: string;
  label: string;
  /** Was die Einstellung bewirkt — erscheint im Admin-UI. */
  description: string;
  /** Fachliche Begruendung/Rechtsgrundlage, falls relevant. */
  rationale?: string;
  /** Fallback-Env-Var, falls kein DB-Wert gesetzt ist. */
  envVar?: string;
  unit: string;
  default: number;
  min: number;
  max: number;
};

/**
 * Aufbewahrungsfrist der Nachweise (Klasse A, ADR 0006). Erste und bislang
 * einzige Einstellung: der Datenschutzbeauftragte soll die Frist final
 * abnehmen koennen, ohne dass dafuer ausgeliefert werden muss.
 */
export const SETTING_RETENTION_YEARS = "retention.years";

export const SETTING_DEFS: Record<string, SettingDef> = {
  [SETTING_RETENTION_YEARS]: {
    key: SETTING_RETENTION_YEARS,
    label: "Aufbewahrungsfrist Nachweise",
    description:
      "Wie lange abgeschlossene Schulungsnachweise aufbewahrt werden, bevor " +
      "der nächtliche Purge sie endgültig löscht.",
    rationale:
      "Regelmäßige Verjährung § 195/§ 199 BGB (3 Jahre), restriktivste " +
      "vertretbare Auslegung. Finale Abnahme liegt beim " +
      "Datenschutzbeauftragten (ADR 0006).",
    envVar: "FINKNOW_RETENTION_YEARS",
    unit: "Jahre",
    default: 3,
    min: 1,
    max: 30,
  },
};

export const SETTING_KEYS = Object.keys(SETTING_DEFS);

/**
 * Parst und validiert einen Rohwert gegen die Deklaration. `null` = nicht
 * verwendbar (fehlend, nicht-numerisch, ausserhalb der Grenzen) — der
 * Aufrufer faellt dann auf die naechste Quelle zurueck. Bewusst KEIN Throw:
 * ein kaputter Wert in der DB darf den Purge nicht zum Absturz bringen,
 * sondern muss auf den bekannten Default zurueckfallen.
 */
export function parseSettingValue(
  def: SettingDef,
  raw: string | null | undefined,
): number | null {
  if (raw == null || raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n < def.min || n > def.max) return null;
  return n;
}

/**
 * Loest den wirksamen Wert aus den drei Quellen auf — DB vor Env vor Default.
 * Gibt den Wert UND die Quelle zurueck, damit das Admin-UI zeigen kann,
 * woher der aktuelle Stand kommt (sonst raet man, ob eine Env-Var noch
 * mitspricht).
 */
export function resolveSetting(
  def: SettingDef,
  dbValue: string | null | undefined,
  envValue: string | null | undefined,
): { value: number; source: SettingSource } {
  const fromDb = parseSettingValue(def, dbValue);
  if (fromDb !== null) return { value: fromDb, source: "db" };
  const fromEnv = parseSettingValue(def, envValue);
  if (fromEnv !== null) return { value: fromEnv, source: "env" };
  return { value: def.default, source: "default" };
}

/**
 * Aufbewahrungsfrist Klasse (A) — reine Fristlogik, KEIN I/O (ADR 0006,
 * „Entschieden (2026-07-24)"). Leaf-Modul analog `lib/training/due-date.ts`:
 * ohne DB-/Payload-Import, isoliert per Vitest verifizierbar.
 *
 * Rechtsgrundlage der Frist: regelmäßige Verjährung § 195/§ 199 BGB (3 Jahre),
 * restriktivste/kürzeste vertretbare Auslegung — kein Puffer, kein
 * Kalenderjahres-Runden (die ADR erwähnt "ab Ende des Entstehungsjahres" als
 * Herkunft der 3 Jahre aus dem BGB, legt aber technisch einen einfachen
 * Datums-Offset fest; siehe ADR 0006 für den Rechtskontext). Konfigurierbar
 * über `FIKNOW_RETENTION_YEARS`, damit der DSB die Frist ohne Codeänderung
 * final abnehmen/anpassen kann.
 */

export const DEFAULT_RETENTION_YEARS = 3;

/**
 * Reine Parse-Funktion (exportiert für direkte Unit-Tests, ohne den
 * Modul-Load-Umweg über `process.env` samt Re-Import-Trick). Fallback
 * `DEFAULT_RETENTION_YEARS` bei fehlendem, leerem, nicht-numerischem oder
 * <= 0 Wert.
 */
export function parseRetentionYears(raw: string | undefined): number {
  if (raw == null || raw.trim() === "") return DEFAULT_RETENTION_YEARS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_RETENTION_YEARS;
  return n;
}

/**
 * Aufbewahrungsfrist in Jahren für Klasse (A) (`training_assignments`).
 * Aus `FIKNOW_RETENTION_YEARS` gelesen; Fallback 3 bei fehlendem oder
 * ungültigem Wert (nicht-numerisch, <= 0).
 */
export const RETENTION_YEARS = parseRetentionYears(
  process.env.FIKNOW_RETENTION_YEARS,
);

function addYears(base: Date, years: number): Date {
  const result = new Date(base.getTime());
  result.setFullYear(result.getFullYear() + years);
  return result;
}

/**
 * True, wenn die Aufbewahrungsfrist ab `anchor` (z. B. `completedAt` einer
 * abgeschlossenen `training_assignments`-Zeile) zum Zeitpunkt `now` bereits
 * abgelaufen ist. Grenzfall `anchor + years === now` gilt als abgelaufen
 * (`>=`), analog `isRecertDue` in `lib/training/due-date.ts`.
 */
export function isRetentionExpired(
  anchor: Date,
  now: Date,
  years: number = RETENTION_YEARS,
): boolean {
  const expiry = addYears(anchor, years);
  return expiry.getTime() <= now.getTime();
}

/**
 * Stichtag für einen **mengenbasierten** Retention-Purge: alle Zeilen mit
 * `completed_at <= retentionCutoff(now)` sind löschreif. Statt pro Zeile
 * `isRetentionExpired` auszuwerten (N Round-Trips), verschiebt der Purge den
 * Vergleich in ein einziges `WHERE completed_at <= $cutoff`. Der Stichtag ist
 * `now` minus `years`, mit derselben `setFullYear`-Semantik wie
 * `isRetentionExpired` — für jeden Anker gilt auf Tagesebene
 * `anchor <= retentionCutoff(now)` ⟺ `isRetentionExpired(anchor, now)`.
 * (Einzige Sub-Tages-Divergenz am 29.02.-Ankerrand durch die Kalender-
 * arithmetik; bei einer 3-Jahres-Frist rechtlich irrelevant.)
 */
export function retentionCutoff(
  now: Date,
  years: number = RETENTION_YEARS,
): Date {
  return addYears(now, -years);
}

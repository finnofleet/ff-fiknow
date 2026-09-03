/**
 * Reine Zähl-Logik der Scope-Achsen-Datenqualität (ADR 0007 §3).
 *
 * Bewusst I/O-freies Leaf-Modul (Projekt-Konvention: reine Logik von DB/
 * Payload trennen → ohne DB unit-testbar, siehe vitest.config.ts). Der
 * Loader liegt in `entity-coverage.ts`, die Begründung „warum das sichtbar
 * sein muss" ebenfalls dort.
 */
import { isLandToken } from "@/lib/land-tokens";

export type EntityCoverage = {
  /** Personen mit mindestens einer Pflichtzuweisung. */
  withAssignments: number;
  /**
   * Davon ohne VERWERTBARES Land. Zählt bewusst nicht nur `null`, sondern
   * auch Werte außerhalb von `LAND_TOKENS`: das Claim-Gate schreibt solche
   * Werte nicht mehr, ein Altbestand kann sie aber noch enthalten (das Gate
   * überschreibt bestehende Werte absichtlich nicht). Für die Sichtbarkeit
   * sind beide Fälle identisch — ein Land, das kein gültiges Token ist,
   * matcht keinen Scope-Grant. Würde hier nur auf `null` geprüft, blieben
   * genau diese Altlasten unsichtbar UND unerfasst.
   */
  missingLand: number;
  /**
   * Davon ohne Rechtseinheit (`bu = null` oder kein Profil). Die
   * Entity-Achse hat kein geschlossenes Vokabular (Freitext, damit neue/
   * umbenannte Gesellschaften keinen Code-Change brauchen) — eine
   * Token-Prüfung wie beim Land ist hier daher nicht möglich.
   */
  missingBu: number;
};

export type EntityCoverageInput = {
  /** User-IDs mit mindestens einer Pflichtzuweisung (bereits dedupliziert). */
  assignedUserIds: string[];
  /** userId → aktuelle Achsen-Werte aus `profiles`. Fehlender Eintrag = kein Profil. */
  byUser: Map<string, { land: string | null; bu: string | null }>;
};

export function computeEntityCoverage({
  assignedUserIds,
  byUser,
}: EntityCoverageInput): EntityCoverage {
  let missingLand = 0;
  let missingBu = 0;
  for (const userId of assignedUserIds) {
    // Kein Profil-Eintrag zählt wie eine fehlende Zuordnung — der
    // Scope-Filter behandelt beides identisch ({land:null, bu:null}).
    const profile = byUser.get(userId);
    const land = profile?.land;
    if (!land || !isLandToken(land)) missingLand += 1;
    if (!profile?.bu) missingBu += 1;
  }
  return { withAssignments: assignedUserIds.length, missingLand, missingBu };
}

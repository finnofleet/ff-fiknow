/**
 * Fristampel für "Meine Pflichtschulungen" (ADR 0005 §3/§5, Phase 3) — reine
 * Funktion, KEIN I/O.
 *
 * Bewusst ein Leaf-Modul (Muster wie lib/paths-progress-compute.ts,
 * lib/training/due-date.ts): nur `import type`, damit die Logik ohne
 * Payload/DB-Modulgraph läuft und isoliert per Vitest verifizierbar ist.
 * Status wird nicht gespeichert (ADR 0005 §3), sondern hier beim Lesen aus
 * `completedAt`/`dueDate` abgeleitet.
 */

export type AmpelStatus = "erledigt" | "offen" | "faellig_bald" | "ueberfaellig";
export type AmpelColor = "green" | "amber" | "red" | "neutral";
export type Ampel = { status: AmpelStatus; color: AmpelColor; label: string };

const DEFAULT_SOON_DAYS = 14;

function addDays(base: Date, days: number): Date {
  const result = new Date(base.getTime());
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Leitet die Fristampel einer Zuweisung ab. Reihenfolge der Regeln ist
 * bewusst so gewählt (siehe ADR 0005 §5):
 *
 *   1. `completedAt` gesetzt        → erledigt (trumpft alles andere)
 *   2. `dueDate` fehlt              → offen, neutral (Pflicht ohne Frist)
 *   3. `dueDate` in der Vergangenheit → überfällig
 *   4. `dueDate` innerhalb `soonDays` → bald fällig
 *   5. sonst                        → offen, grün
 */
export function computeAmpel(
  input: { completedAt: Date | null; dueDate: Date | null },
  now: Date,
  opts?: { soonDays?: number },
): Ampel {
  if (input.completedAt != null) {
    return { status: "erledigt", color: "green", label: "Erledigt" };
  }

  if (input.dueDate == null) {
    return { status: "offen", color: "neutral", label: "Offen" };
  }

  if (input.dueDate.getTime() < now.getTime()) {
    return { status: "ueberfaellig", color: "red", label: "Überfällig" };
  }

  const soonDays = opts?.soonDays ?? DEFAULT_SOON_DAYS;
  const soonThreshold = addDays(now, soonDays);
  if (input.dueDate.getTime() <= soonThreshold.getTime()) {
    return { status: "faellig_bald", color: "amber", label: "Bald fällig" };
  }

  return { status: "offen", color: "green", label: "Offen" };
}

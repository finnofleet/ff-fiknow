/**
 * Fristen-Logik für Pflichtkurse (ADR 0005) — reine Funktionen, KEIN I/O.
 *
 * Bewusst ein Leaf-Modul (Muster wie lib/paths-progress-compute.ts): nur
 * `import type`, damit die Logik ohne Payload/DB-Modulgraph läuft und isoliert
 * per Vitest verifizierbar ist. Aufrufer (lib/training/reconcile.ts) laden die
 * Eingaben (assignedAt/startedAt aus enrollments, dueRule aus
 * training-requirements) und reichen sie hier rein.
 */

export type DueRuleType = "ab_start" | "ab_zuweisung" | "fixes_datum";

export type DueRule = {
  type: DueRuleType;
  offsetDays?: number | null;
  fixedDate?: string | Date | null;
};

export type DueDateContext = {
  assignedAt: Date;
  startedAt?: Date | null;
};

function addDays(base: Date, days: number): Date {
  const result = new Date(base.getTime());
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Berechnet die Fälligkeit einer Zuweisung aus der Fristregel
 * (`training-requirements.dueRule`). `null`, wenn die Regel keine Fälligkeit
 * ergibt (fehlende Eingaben) — die Zuweisung bleibt dann ohne Frist offen.
 */
export function computeDueDate(
  rule: DueRule,
  ctx: DueDateContext,
): Date | null {
  switch (rule.type) {
    case "ab_zuweisung": {
      if (rule.offsetDays == null) return null;
      return addDays(ctx.assignedAt, rule.offsetDays);
    }
    case "ab_start": {
      if (!ctx.startedAt) return null;
      if (rule.offsetDays == null) return null;
      return addDays(ctx.startedAt, rule.offsetDays);
    }
    case "fixes_datum": {
      if (!rule.fixedDate) return null;
      return new Date(rule.fixedDate);
    }
    default:
      return null;
  }
}

/**
 * True, wenn eine abgeschlossene Zuweisung erneut fällig ist
 * (Rezertifizierung, `training-requirements.recurrenceMonths`).
 * `recurrenceMonths <= 0` → nie fällig (einmalig).
 *
 * Monats-Addition via `setMonth` (nicht `days * 30`), damit unterschiedliche
 * Monatslängen sauber behandelt werden.
 */
export function isRecertDue(
  completedAt: Date,
  recurrenceMonths: number,
  now: Date,
): boolean {
  if (recurrenceMonths <= 0) return false;
  const nextDue = new Date(completedAt.getTime());
  nextDue.setMonth(nextDue.getMonth() + recurrenceMonths);
  return nextDue.getTime() <= now.getTime();
}

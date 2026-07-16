/**
 * Reine Dedup-Logik für die User-Ansicht "Meine Pflichtschulungen"
 * (ADR 0005, Phase 3) — KEIN I/O (Leaf-Modul, nur `import type`).
 *
 * Ein User kann für DENSELBEN Kurs mehrere Assignment-Zeilen haben — z. B. über
 * den `course_mandatory`-Toggle UND eine `requirement` gleichzeitig, oder über
 * mehrere Rezertifizierungs-Zyklen. Für die User-Ansicht ist das EINE Pflicht:
 * "diesen Kurs absolvieren". Diese Funktion wählt pro Kurs die eine
 * repräsentative Zeile.
 *
 * Regel:
 *  - Gibt es OFFENE Zeilen (completedAt == null) → die dringlichste offene:
 *    früheste dueDate (ohne Frist zuletzt), bei Gleichstand höchster Zyklus.
 *    (Der Kurs ist eine aktive Pflicht — der aktuelle offene Zyklus zählt.)
 *  - Sind ALLE Zeilen erledigt → die zuletzt erledigte (spätestes completedAt).
 *
 * Das spiegelt die Dedup-Logik des Compliance-Dashboards
 * (lib/training/compliance-compute.ts), das ebenfalls je (User, Kurs) einmal
 * zählt.
 */

export type AssignmentRow = {
  courseSlug: string;
  courseTitleSnapshot: string | null;
  dueDate: Date | null;
  completedAt: Date | null;
  cycle: number;
};

function byEarliestDueThenCycle(a: AssignmentRow, b: AssignmentRow): number {
  if (a.dueDate == null && b.dueDate == null) return b.cycle - a.cycle;
  if (a.dueDate == null) return 1;
  if (b.dueDate == null) return -1;
  const diff = a.dueDate.getTime() - b.dueDate.getTime();
  return diff !== 0 ? diff : b.cycle - a.cycle;
}

function byLatestCompleted(a: AssignmentRow, b: AssignmentRow): number {
  return (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0);
}

/** Eine repräsentative Zeile je Kurs (siehe Modul-Doc). */
export function pickCourseRepresentatives(
  rows: AssignmentRow[],
): AssignmentRow[] {
  const byCourse = new Map<string, AssignmentRow[]>();
  for (const row of rows) {
    const group = byCourse.get(row.courseSlug);
    if (group) group.push(row);
    else byCourse.set(row.courseSlug, [row]);
  }

  const reps: AssignmentRow[] = [];
  for (const group of byCourse.values()) {
    const open = group.filter((r) => r.completedAt == null);
    if (open.length > 0) {
      reps.push([...open].sort(byEarliestDueThenCycle)[0]);
    } else {
      reps.push([...group].sort(byLatestCompleted)[0]);
    }
  }
  return reps;
}

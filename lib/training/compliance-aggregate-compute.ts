/**
 * Reine Aggregation fuer die PII-FREIE Compliance-Aggregat-Sicht
 * (ADR 0007 §9, Phase P3b) — KEIN I/O, keine Namen/User-IDs in der Ausgabe.
 *
 * Leaf-Modul (Muster wie compliance-compute.ts): isoliert per Vitest
 * verifizierbar. Das Laden haengt lib/training/compliance-aggregate.ts davor.
 *
 * Buckets = Kurs × Land. Nenner je Bucket = zugewiesene Personen; ein User
 * zaehlt pro Kurs GENAU EINMAL (gleiche Dedup-Idee wie computeCompliance:
 * "abgeschlossen" = mindestens eine Assignment-Zeile des Users fuer den Kurs
 * ist abgeschlossen). k-Anonymitaet: Buckets mit weniger als `SUPPRESS_BELOW`
 * Personen werden unterdrueckt (nur `suppressed: true`, KEINE Zahlen) — das
 * verhindert Rueckschluss auf Einzelpersonen (DSG, §9).
 */

/** k-Anonymitaet: Buckets mit < 5 Personen werden unterdrueckt (P3b-Entscheidung). */
export const SUPPRESS_BELOW = 5;

/** Bucket-Label fuer User ohne aktuelle Land-Zuordnung (profiles.land = null). */
export const LAND_UNASSIGNED = "(ohne Zuordnung)";

export type AggregateBucket =
  | { land: string; suppressed: true }
  | {
      land: string;
      suppressed: false;
      assigned: number;
      completed: number;
      pct: number;
    };

export type CourseAggregate = {
  courseSlug: string;
  title: string;
  buckets: AggregateBucket[];
};

export type ComputeAggregateInput = {
  assignments: {
    userId: string;
    courseSlug: string;
    completedAt: Date | null;
  }[];
  /** userId -> aktuelles Land (profiles.land); null/unbekannt -> LAND_UNASSIGNED. */
  userLand: Map<string, string | null>;
  /** courseSlug -> Kurs-Titel. */
  titles: Map<string, string>;
};

/**
 * Reduziert die Assignment-Zeilen je (Kurs, User) auf ein einziges
 * "abgeschlossen"-Flag: true, sobald IRGENDEINE Zeile des Users fuer den Kurs
 * ein `completedAt != null` hat. So zaehlt jeder User pro Kurs genau einmal.
 */
function completionByCourseAndUser(
  assignments: ComputeAggregateInput["assignments"],
): Map<string, Map<string, boolean>> {
  const byCourse = new Map<string, Map<string, boolean>>();
  for (const a of assignments) {
    let byUser = byCourse.get(a.courseSlug);
    if (!byUser) {
      byUser = new Map<string, boolean>();
      byCourse.set(a.courseSlug, byUser);
    }
    const prev = byUser.get(a.userId) ?? false;
    byUser.set(a.userId, prev || a.completedAt != null);
  }
  return byCourse;
}

export function computeComplianceAggregate(
  input: ComputeAggregateInput,
  suppressBelow: number = SUPPRESS_BELOW,
): CourseAggregate[] {
  const byCourse = completionByCourseAndUser(input.assignments);
  const result: CourseAggregate[] = [];

  for (const [courseSlug, byUser] of byCourse) {
    const byLand = new Map<string, { assigned: number; completed: number }>();
    for (const [userId, completed] of byUser) {
      const land = input.userLand.get(userId) ?? null;
      const key = land ?? LAND_UNASSIGNED;
      const b = byLand.get(key) ?? { assigned: 0, completed: 0 };
      b.assigned += 1;
      if (completed) b.completed += 1;
      byLand.set(key, b);
    }

    const buckets: AggregateBucket[] = [...byLand.entries()]
      .map(([land, b]): AggregateBucket =>
        b.assigned < suppressBelow
          ? { land, suppressed: true }
          : {
              land,
              suppressed: false,
              assigned: b.assigned,
              completed: b.completed,
              pct: Math.round((b.completed / b.assigned) * 100),
            },
      )
      .sort((x, y) => (x.land < y.land ? -1 : x.land > y.land ? 1 : 0));

    result.push({
      courseSlug,
      title: input.titles.get(courseSlug) ?? courseSlug,
      buckets,
    });
  }

  result.sort((a, b) => (a.title < b.title ? -1 : a.title > b.title ? 1 : 0));
  return result;
}

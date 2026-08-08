/**
 * Reine Aggregation für das Compliance-Dashboard (ADR 0005 §5, Phase 4) —
 * KEIN I/O.
 *
 * Bewusst ein Leaf-Modul (Muster wie lib/paths-progress-compute.ts,
 * lib/training/ampel.ts): nur `import type`, damit die Logik ohne
 * Payload/DB-Modulgraph läuft und isoliert per Vitest verifizierbar ist.
 * Das Laden (Assignments/Enrollments/Progress/Profile/Titel) hängt
 * lib/training/compliance.ts davor.
 *
 * Nenner = zugewiesene Teilnehmer (ADR 0005, Entscheidung 5): ein User zählt
 * pro Kurs GENAU EINMAL, auch wenn mehrere Assignment-Zeilen existieren (z. B.
 * `course_mandatory`-Toggle + `requirement` für denselben Kurs). Dedup ist
 * daher der zentrale Schritt dieser Funktion.
 *
 * Phase 6d (Art.-4-Schärfung, Auswertung): jeder Kurs bekommt zusätzlich die
 * LIVE aus dem Kurs gelesenen `complianceDrivers` + `estimatedMinutes`
 * (nicht aus dem eingefrorenen `evidence`) — Basis für Treiber-Badges/-Filter
 * im Dashboard. Jeder Teilnehmer trägt zusätzlich den beim Abschluss
 * eingefrorenen Nachweis (`courseVersionSnapshot`, `cycle`, `evidence`) —
 * Basis für den CSV-Audit-Export (eine Zeile pro Teilnehmer × Kurs).
 */
import type { CompletionEvidence } from "./completion-compute";

export type ParticipantStatus =
  | "nicht_gestartet"
  | "gestartet"
  | "abgeschlossen";

export type Participant = {
  userId: string;
  displayName: string;
  status: ParticipantStatus;
  /** enrollments.enrolled_at — Einschreibe-/Zuweisungszeitpunkt (immer gesetzt). */
  enrolledAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  /** Beim Abschluss eingefrorenes `courses.version`-Token, sonst `null`. */
  courseVersionSnapshot: string | null;
  /** Rezertifizierungs-Zyklus der gewinnenden Assignment-Zeile (Default 1). */
  cycle: number;
  /** Beim Abschluss eingefrorener Nachweis-Payload, sonst `null`. */
  evidence: CompletionEvidence | null;
};

export type CourseCompliance = {
  courseSlug: string;
  title: string;
  /** LIVE `courses.complianceDrivers` (nicht eingefroren) — Phase 6d. */
  drivers: string[];
  /** LIVE `courses.estimatedMinutes` (nicht eingefroren) oder `null`. */
  estimatedMinutes: number | null;
  assigned: number;
  started: number;
  completed: number;
  notStarted: number;
  pct: number;
  participants: Participant[];
};

export type ComputeComplianceInput = {
  assignments: {
    userId: string;
    courseSlug: string;
    completedAt: Date | null;
    courseVersionSnapshot?: string | null;
    cycle?: number;
    evidence?: CompletionEvidence | null;
  }[];
  /** key `${userId}::${courseSlug}` -> enrollment.enrolledAt */
  enrolledAt?: Map<string, Date>;
  /** key `${userId}::${courseSlug}` -> enrollment.startedAt */
  startedAt: Map<string, Date>;
  /** key `${userId}::${courseSlug}` (lesson_progress existiert) */
  hasProgress: Set<string>;
  /** userId -> displayName */
  displayNames: Map<string, string>;
  /** courseSlug -> Kurs-Titel */
  titles: Map<string, string>;
  /** courseSlug -> LIVE `complianceDrivers` (Phase 6d). Optional, Default leer. */
  drivers?: Map<string, string[]>;
  /** courseSlug -> LIVE `estimatedMinutes` (Phase 6d). Optional. */
  estimatedMinutes?: Map<string, number>;
};

const STATUS_RANK: Record<ParticipantStatus, number> = {
  nicht_gestartet: 0,
  gestartet: 1,
  abgeschlossen: 2,
};

function participantKey(userId: string, courseSlug: string): string {
  return `${userId}::${courseSlug}`;
}

/** Die je (Kurs, User) „gewinnende" Assignment-Zeile — siehe dedupeByCourseAndUser. */
type WinningRow = {
  completedAt: Date | null;
  courseVersionSnapshot: string | null;
  cycle: number;
  evidence: CompletionEvidence | null;
};

/**
 * Dedupliziert Assignments je (Kurs, User): das Ergebnis ist die Zeile mit dem
 * frühesten `completedAt`-Zeitstempel unter allen Assignment-Zeilen des Users
 * für diesen Kurs (samt ihres eingefrorenen Snapshots/Nachweises), oder eine
 * Zeile mit `completedAt: null`, wenn noch keine der Zeilen abgeschlossen ist.
 * Ein User ohne gesehene Zeile taucht im fertigen Ergebnis nicht auf.
 */
function dedupeByCourseAndUser(
  assignments: ComputeComplianceInput["assignments"],
): Map<string, Map<string, WinningRow>> {
  const byCourse = new Map<string, Map<string, WinningRow>>();

  for (const a of assignments) {
    let byUser = byCourse.get(a.courseSlug);
    if (!byUser) {
      byUser = new Map<string, WinningRow>();
      byCourse.set(a.courseSlug, byUser);
    }

    const candidate: WinningRow = {
      completedAt: a.completedAt,
      courseVersionSnapshot: a.courseVersionSnapshot ?? null,
      cycle: a.cycle ?? 1,
      evidence: a.evidence ?? null,
    };

    const current = byUser.get(a.userId);

    if (a.completedAt != null) {
      if (current == null || current.completedAt == null) {
        // Noch nicht gesehen ODER bisher nur nicht-abgeschlossene Zeilen.
        byUser.set(a.userId, candidate);
      } else if (a.completedAt < current.completedAt) {
        // Bereits eine abgeschlossene Zeile bekannt — frühesten Zeitstempel behalten.
        byUser.set(a.userId, candidate);
      }
    } else if (!current) {
      // Erste gesehene Zeile für diesen User ist nicht abgeschlossen.
      byUser.set(a.userId, candidate);
    }
    // Sonst: bereits ein Eintrag vorhanden (completed oder nicht) — eine
    // weitere nicht-abgeschlossene Zeile ändert daran nichts.
  }

  return byCourse;
}

function deriveStatus(
  key: string,
  completedAt: Date | null,
  input: ComputeComplianceInput,
): ParticipantStatus {
  if (completedAt != null) return "abgeschlossen";
  if (input.startedAt.has(key) || input.hasProgress.has(key)) return "gestartet";
  return "nicht_gestartet";
}

function compareParticipants(a: Participant, b: Participant): number {
  const rankDiff = STATUS_RANK[a.status] - STATUS_RANK[b.status];
  if (rankDiff !== 0) return rankDiff;
  return a.displayName < b.displayName ? -1 : a.displayName > b.displayName ? 1 : 0;
}

function compareCourses(a: CourseCompliance, b: CourseCompliance): number {
  if (a.pct !== b.pct) return a.pct - b.pct;
  return a.title < b.title ? -1 : a.title > b.title ? 1 : 0;
}

export function computeCompliance(
  input: ComputeComplianceInput,
): CourseCompliance[] {
  const byCourse = dedupeByCourseAndUser(input.assignments);

  const result: CourseCompliance[] = [];

  for (const [courseSlug, byUser] of byCourse) {
    const participants: Participant[] = [];

    for (const [userId, row] of byUser) {
      const key = participantKey(userId, courseSlug);
      participants.push({
        userId,
        displayName: input.displayNames.get(userId) ?? userId,
        status: deriveStatus(key, row.completedAt, input),
        enrolledAt: input.enrolledAt?.get(key) ?? null,
        startedAt: input.startedAt.get(key) ?? null,
        completedAt: row.completedAt,
        courseVersionSnapshot: row.courseVersionSnapshot,
        cycle: row.cycle,
        evidence: row.evidence,
      });
    }

    participants.sort(compareParticipants);

    const assigned = participants.length;
    const completed = participants.filter((p) => p.status === "abgeschlossen").length;
    const started = participants.filter((p) => p.status === "gestartet").length;
    const notStarted = participants.filter((p) => p.status === "nicht_gestartet").length;
    const pct = assigned > 0 ? Math.round((completed / assigned) * 100) : 0;

    result.push({
      courseSlug,
      title: input.titles.get(courseSlug) ?? courseSlug,
      drivers: input.drivers?.get(courseSlug) ?? [],
      estimatedMinutes: input.estimatedMinutes?.get(courseSlug) ?? null,
      assigned,
      started,
      completed,
      notStarted,
      pct,
      participants,
    });
  }

  result.sort(compareCourses);
  return result;
}

// ============================================================
// Treiber-Filter (Phase 6d) — geteilt zwischen Dashboard-Page und
// CSV-Export-Route, damit beide exakt denselben `?driver=`-Filter anwenden.
// ============================================================

/**
 * Alle Treiber-Werte, die über die übergebenen Kurse tatsächlich vorkommen,
 * sortiert — Basis für die Filterleiste im Dashboard (nur Werte zeigen, die
 * auch etwas filtern).
 */
export function collectDriverOptions(courses: CourseCompliance[]): string[] {
  const set = new Set<string>();
  for (const course of courses) {
    for (const driver of course.drivers) set.add(driver);
  }
  return [...set].sort();
}

/**
 * Filtert Kurse auf einen Compliance-Treiber. `null`/leer/unbekannt ⇒
 * unverändert (kein Filter) bzw. leeres Ergebnis nur bei einem Treiber, den
 * kein Kurs trägt — nie ein Crash.
 */
export function filterCoursesByDriver(
  courses: CourseCompliance[],
  driver: string | null | undefined,
): CourseCompliance[] {
  if (!driver) return courses;
  return courses.filter((course) => course.drivers.includes(driver));
}

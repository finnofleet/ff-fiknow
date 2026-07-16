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
 */

export type ParticipantStatus =
  | "nicht_gestartet"
  | "gestartet"
  | "abgeschlossen";

export type Participant = {
  userId: string;
  displayName: string;
  status: ParticipantStatus;
  startedAt: Date | null;
  completedAt: Date | null;
};

export type CourseCompliance = {
  courseSlug: string;
  title: string;
  assigned: number;
  started: number;
  completed: number;
  notStarted: number;
  pct: number;
  participants: Participant[];
};

export type ComputeComplianceInput = {
  assignments: { userId: string; courseSlug: string; completedAt: Date | null }[];
  /** key `${userId}::${courseSlug}` -> enrollment.startedAt */
  startedAt: Map<string, Date>;
  /** key `${userId}::${courseSlug}` (lesson_progress existiert) */
  hasProgress: Set<string>;
  /** userId -> displayName */
  displayNames: Map<string, string>;
  /** courseSlug -> Kurs-Titel */
  titles: Map<string, string>;
};

const STATUS_RANK: Record<ParticipantStatus, number> = {
  nicht_gestartet: 0,
  gestartet: 1,
  abgeschlossen: 2,
};

function participantKey(userId: string, courseSlug: string): string {
  return `${userId}::${courseSlug}`;
}

/**
 * Dedupliziert Assignments je (Kurs, User): das Ergebnis ist der früheste
 * `completedAt`-Zeitstempel unter allen Assignment-Zeilen des Users für
 * diesen Kurs, oder `null`, wenn noch keine der Zeilen abgeschlossen ist.
 * `undefined` (nicht in der Map) bedeutet: für diesen User existiert noch
 * keine gesehene Zeile — wird beim ersten Durchlauf sofort auf `Date | null`
 * gesetzt, taucht also im fertigen Ergebnis nicht mehr auf.
 */
function dedupeByCourseAndUser(
  assignments: ComputeComplianceInput["assignments"],
): Map<string, Map<string, Date | null>> {
  const byCourse = new Map<string, Map<string, Date | null>>();

  for (const a of assignments) {
    let byUser = byCourse.get(a.courseSlug);
    if (!byUser) {
      byUser = new Map<string, Date | null>();
      byCourse.set(a.courseSlug, byUser);
    }

    const current = byUser.get(a.userId);

    if (a.completedAt != null) {
      if (current == null) {
        // Noch nicht gesehen ODER bisher nur nicht-abgeschlossene Zeilen.
        byUser.set(a.userId, a.completedAt);
      } else {
        // Bereits eine abgeschlossene Zeile bekannt — frühesten Zeitstempel behalten.
        byUser.set(a.userId, a.completedAt < current ? a.completedAt : current);
      }
    } else if (!byUser.has(a.userId)) {
      // Erste gesehene Zeile für diesen User ist nicht abgeschlossen.
      byUser.set(a.userId, null);
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

    for (const [userId, completedAt] of byUser) {
      const key = participantKey(userId, courseSlug);
      participants.push({
        userId,
        displayName: input.displayNames.get(userId) ?? userId,
        status: deriveStatus(key, completedAt, input),
        startedAt: input.startedAt.get(key) ?? null,
        completedAt,
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

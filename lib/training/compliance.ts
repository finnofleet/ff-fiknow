/**
 * I/O-Loader für das Compliance-Dashboard (ADR 0005 §5, Phase 4).
 *
 * Sammelt alle Rohdaten (Assignments, Profile, Enrollments, Lesson-Progress,
 * Kurs-Titel) und übergibt sie an die reine Aggregation
 * (lib/training/compliance-compute.ts). Autorisierung ist App-seitig
 * (Rollen-Check in der aufrufenden Page via `canManageCourses`), NICHT über
 * RLS — diese Funktion läuft über die privilegierte Server-`db`-Connection
 * (RLS-Bypass, wie `training_assignments`-Select in reconcile.ts) und liest
 * daher bewusst ALLE User, nicht nur die des Aufrufers.
 */
import { getCourse } from "@/lib/content";
import { db } from "@/lib/db/client";
import { enrollments, lessonProgress, profiles, trainingAssignments } from "@/lib/db/schema";

import { computeCompliance, type CourseCompliance } from "./compliance-compute";
import { passesViewerScope, type ViewerScope } from "./entity-scope";
import { reconcileAssignments } from "./reconcile";

function participantKey(userId: string, courseSlug: string): string {
  return `${userId}::${courseSlug}`;
}

/**
 * Liest den vollen Compliance-Stand über alle Pflichtkurse. Stößt vorab
 * `reconcileAssignments()` an (frische Zuweisungen inkl. lazy
 * Rezertifizierung), bevor gelesen wird — analog `getMyTrainingAssignments`
 * darf ein Fehlschlag dabei das Dashboard NIE zum Absturz bringen (nur
 * geloggt, dann mit dem vorhandenen Stand weiter).
 *
 * `opts.viewerScope` (ADR 0007 P2b/P3) filtert die Nachweis-Zeilen auf den
 * Sicht-Scope des Betrachters — gegen die AKTUELLE Land/BU-Zugehoerigkeit
 * (profiles), nicht den Nachweis-Snapshot (ADR §3). Fehlt er oder ist er
 * `unrestricted`, bleibt das Verhalten unveraendert (heutiger Stand: alles).
 */
export async function getComplianceOverview(
  opts: { viewerScope?: ViewerScope } = {},
): Promise<CourseCompliance[]> {
  try {
    await reconcileAssignments();
  } catch (err) {
    console.error(
      "[training/compliance] reconcileAssignments() fehlgeschlagen",
      err,
    );
  }

  const assignmentRows = await db
    .select({
      userId: trainingAssignments.userId,
      courseSlug: trainingAssignments.courseSlug,
      completedAt: trainingAssignments.completedAt,
      courseVersionSnapshot: trainingAssignments.courseVersionSnapshot,
      cycle: trainingAssignments.cycle,
      evidence: trainingAssignments.evidence,
    })
    .from(trainingAssignments);

  if (assignmentRows.length === 0) return [];

  // Profile zuerst laden — liefert die Anzeigenamen UND die AKTUELLE
  // Land/BU-Zugehoerigkeit, gegen die der Sicht-Scope aufgeloest wird.
  const profileRows = await db
    .select({
      userId: profiles.userId,
      displayName: profiles.displayName,
      land: profiles.land,
      bu: profiles.bu,
    })
    .from(profiles);
  const displayNames = new Map<string, string>();
  const userEntity = new Map<string, { land: string | null; bu: string | null }>();
  for (const row of profileRows) {
    if (row.displayName) displayNames.set(row.userId, row.displayName);
    userEntity.set(row.userId, { land: row.land, bu: row.bu });
  }

  // ADR 0007 P2b/P3: Sicht-Scope gegen die AKTUELLE Org (profiles.land/bu),
  // NICHT gegen den Nachweis-Snapshot (ADR §3: „Sichtbarkeit wird zur
  // Query-Zeit gegen die aktuelle Org aufgeloest"). Der Snapshot ist der
  // unveraenderliche Audit-Fakt, kein Sichtfilter — und er ist nur bei
  // abgeschlossenen Nachweisen gesetzt; ein scoped Betrachter muss aber gerade
  // die noch OFFENEN Faelle seines Scopes sehen. `unrestricted` (Default)
  // laesst alle Zeilen durch = heutiges Verhalten. User ohne Profil-Eintrag
  // gelten als {land:null, bu:null} (matchen keinen gesetzten Scope, strikt).
  const viewerScope: ViewerScope = opts.viewerScope ?? { kind: "unrestricted" };
  const scopedRows =
    viewerScope.kind === "unrestricted"
      ? assignmentRows
      : assignmentRows.filter((row) =>
          passesViewerScope(
            userEntity.get(row.userId) ?? { land: null, bu: null },
            viewerScope,
          ),
        );
  if (scopedRows.length === 0) return [];

  const enrollmentRows = await db
    .select({ userId: enrollments.userId, courseSlug: enrollments.courseSlug, startedAt: enrollments.startedAt })
    .from(enrollments);
  const startedAt = new Map<string, Date>();
  for (const row of enrollmentRows) {
    startedAt.set(participantKey(row.userId, row.courseSlug), row.startedAt);
  }

  const progressRows = await db
    .selectDistinct({
      userId: lessonProgress.userId,
      courseSlug: lessonProgress.courseSlug,
    })
    .from(lessonProgress);
  const hasProgress = new Set<string>(
    progressRows.map((row) => participantKey(row.userId, row.courseSlug)),
  );

  // Titel + Treiber + Umfang batchen: je distinct Slug nur einmal laden statt
  // pro Zeile. Treiber/Umfang werden LIVE aus dem Kurs gelesen (Phase 6d,
  // Art.-4-Schärfung) — bewusst NICHT aus dem eingefrorenen `evidence`, damit
  // Dashboard-Badges/-Filter immer den aktuellen Kurs-Stand zeigen.
  const courseSlugs = Array.from(
    new Set(scopedRows.map((row) => row.courseSlug)),
  );
  const titles = new Map<string, string>();
  const drivers = new Map<string, string[]>();
  const estimatedMinutes = new Map<string, number>();
  await Promise.all(
    courseSlugs.map(async (slug) => {
      try {
        const course = await getCourse(slug);
        if (course) {
          titles.set(slug, course.frontmatter.title);
          drivers.set(slug, course.frontmatter.compliance_drivers ?? []);
          if (typeof course.frontmatter.estimated_minutes === "number") {
            estimatedMinutes.set(slug, course.frontmatter.estimated_minutes);
          }
        }
      } catch (err) {
        console.error(`[training/compliance] getCourse(${slug}) fehlgeschlagen`, err);
      }
    }),
  );

  return computeCompliance({
    // `evidence` kommt aus Drizzle typlos (jsonb) — cast auf die reine
    // `CompletionEvidence`-Form, die completion.ts beim Abschluss schreibt.
    assignments: scopedRows.map((row) => ({
      ...row,
      evidence: row.evidence as CourseCompliance["participants"][number]["evidence"],
    })),
    startedAt,
    hasProgress,
    displayNames,
    titles,
    drivers,
    estimatedMinutes,
  });
}

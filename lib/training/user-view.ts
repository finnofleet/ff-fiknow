/**
 * Datenfunktion für "Meine Pflichtschulungen" (ADR 0005, Phase 3).
 *
 * Lazy Reconcile (ADR 0005, Konsequenzen: "nächster Zyklus wird lazy beim
 * Reconcile materialisiert, z. B. beim Öffnen der Ansichten") + Lesen aller
 * Assignment-Zeilen des Users + Ableitung der Fristampel
 * (lib/training/ampel.ts) für die Anzeige.
 */
import { eq } from "drizzle-orm";

import { getCourse } from "@/lib/content";
import { db } from "@/lib/db/client";
import { trainingAssignments } from "@/lib/db/schema";

import { computeAmpel, type Ampel, type AmpelStatus } from "./ampel";
import { pickCourseRepresentatives } from "./dedupe-assignments";
import { reconcileForUser } from "./reconcile";

export type MyTrainingItem = {
  courseSlug: string;
  title: string;
  ampel: Ampel;
  dueDate: Date | null;
  completedAt: Date | null;
  cycle: number;
  href: string;
};

const STATUS_RANK: Record<AmpelStatus, number> = {
  ueberfaellig: 0,
  faellig_bald: 1,
  offen: 2,
  erledigt: 3,
};

function compareItems(a: MyTrainingItem, b: MyTrainingItem): number {
  const rankDiff = STATUS_RANK[a.ampel.status] - STATUS_RANK[b.ampel.status];
  if (rankDiff !== 0) return rankDiff;

  if (a.ampel.status === "erledigt") {
    // Erledigte: neueste Erledigung zuerst.
    const at = a.completedAt?.getTime() ?? 0;
    const bt = b.completedAt?.getTime() ?? 0;
    return bt - at;
  }

  // Offen/bald fällig/überfällig: dueDate aufsteigend, ohne Frist zuletzt.
  if (a.dueDate == null && b.dueDate == null) return 0;
  if (a.dueDate == null) return 1;
  if (b.dueDate == null) return -1;
  return a.dueDate.getTime() - b.dueDate.getTime();
}

/**
 * Liest alle Pflicht-Zuweisungen eines Users für die "Meine
 * Pflichtschulungen"-Ansicht. Stößt vorab lazy `reconcileForUser` an, damit
 * neue/fällige Pflichten (inkl. Rezertifizierung) materialisiert sind, bevor
 * gelesen wird — ein Fehlschlag dabei darf die Seite NIE brechen (nur
 * geloggt), da die Ansicht auch mit dem bisherigen Stand sinnvoll ist.
 */
export async function getMyTrainingAssignments(
  userId: string,
): Promise<MyTrainingItem[]> {
  try {
    await reconcileForUser(userId);
  } catch (err) {
    console.error(
      `[training/user-view] reconcileForUser(${userId}) fehlgeschlagen`,
      err,
    );
  }

  const now = new Date();

  const rows = await db
    .select({
      courseSlug: trainingAssignments.courseSlug,
      courseTitleSnapshot: trainingAssignments.courseTitleSnapshot,
      dueDate: trainingAssignments.dueDate,
      completedAt: trainingAssignments.completedAt,
      cycle: trainingAssignments.cycle,
    })
    .from(trainingAssignments)
    .where(eq(trainingAssignments.userId, userId));

  if (rows.length === 0) return [];

  // Dedup: ein User kann pro Kurs mehrere Assignments haben (Toggle +
  // Requirement, oder mehrere Rezert-Zyklen) — für die Ansicht ist das EINE
  // Pflicht. Eine repräsentative Zeile je Kurs (dringlichste offene, sonst
  // zuletzt erledigte). Löst auch die doppelten Zeilen + kollidierenden
  // React-Keys (courseSlug ist danach eindeutig).
  const reps = pickCourseRepresentatives(rows);

  // Live-Titel batchen: nur für Zeilen ohne Snapshot (= noch nicht
  // abgeschlossen), und je distinct Slug nur einmal laden.
  const missingSlugs = Array.from(
    new Set(
      reps.filter((r) => !r.courseTitleSnapshot).map((r) => r.courseSlug),
    ),
  );
  const liveTitles = new Map<string, string>();
  await Promise.all(
    missingSlugs.map(async (slug) => {
      try {
        const course = await getCourse(slug);
        if (course) liveTitles.set(slug, course.frontmatter.title);
      } catch (err) {
        console.error(
          `[training/user-view] getCourse(${slug}) fehlgeschlagen`,
          err,
        );
      }
    }),
  );

  const items: MyTrainingItem[] = reps.map((row) => ({
    courseSlug: row.courseSlug,
    // Snapshot bevorzugt (bei erledigten gesetzt); sonst Live-Titel; sonst
    // Slug als letzter Fallback (z. B. Kurs zwischenzeitlich gelöscht).
    title: row.courseTitleSnapshot ?? liveTitles.get(row.courseSlug) ?? row.courseSlug,
    ampel: computeAmpel({ completedAt: row.completedAt, dueDate: row.dueDate }, now),
    dueDate: row.dueDate,
    completedAt: row.completedAt,
    cycle: row.cycle,
    href: `/courses/${row.courseSlug}`,
  }));

  return items.sort(compareItems);
}

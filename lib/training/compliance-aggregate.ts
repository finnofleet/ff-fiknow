/**
 * PII-freier I/O-Loader fuer die aggregierte Compliance-Sicht (ADR 0007 §9,
 * Phase P3b). Liest NUR, was zum Zaehlen noetig ist — NIE displayName; die
 * Ausgabe (CourseAggregate) enthaelt weder Namen noch User-IDs (PII-frei by
 * construction). Scope-Filter gegen die AKTUELLE Org (profiles.land/bu),
 * identisch zu getComplianceOverview (ADR §3).
 */
import { getCourse } from "@/lib/content";
import { db } from "@/lib/db/client";
import { profiles, trainingAssignments } from "@/lib/db/schema";
import { redactError } from "@/lib/log-redact";

import {
  computeComplianceAggregate,
  type CourseAggregate,
} from "./compliance-aggregate-compute";
import { passesViewerScope, type ViewerScope } from "./entity-scope";
import { reconcileAssignments } from "./reconcile";

export async function getComplianceAggregate(
  opts: { viewerScope?: ViewerScope } = {},
): Promise<CourseAggregate[]> {
  try {
    await reconcileAssignments();
  } catch (err) {
    console.error(
      "[training/compliance-aggregate] reconcileAssignments() fehlgeschlagen",
      redactError(err),
    );
  }

  const assignmentRows = await db
    .select({
      userId: trainingAssignments.userId,
      courseSlug: trainingAssignments.courseSlug,
      completedAt: trainingAssignments.completedAt,
    })
    .from(trainingAssignments);

  if (assignmentRows.length === 0) return [];

  const profileRows = await db
    .select({
      userId: profiles.userId,
      land: profiles.land,
      bu: profiles.bu,
    })
    .from(profiles);
  const userEntity = new Map<string, { land: string | null; bu: string | null }>();
  const userLand = new Map<string, string | null>();
  for (const row of profileRows) {
    userEntity.set(row.userId, { land: row.land, bu: row.bu });
    userLand.set(row.userId, row.land);
  }

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

  const courseSlugs = Array.from(new Set(scopedRows.map((row) => row.courseSlug)));
  const titles = new Map<string, string>();
  await Promise.all(
    courseSlugs.map(async (slug) => {
      try {
        const course = await getCourse(slug);
        if (course) titles.set(slug, course.frontmatter.title);
      } catch (err) {
        console.error(
          `[training/compliance-aggregate] getCourse(${slug}) fehlgeschlagen`,
          redactError(err),
        );
      }
    }),
  );

  return computeComplianceAggregate({
    assignments: scopedRows,
    userLand,
    titles,
  });
}

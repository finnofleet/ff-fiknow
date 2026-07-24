/**
 * Konto-Löschung/Austritt — Klasse (B) Hard-Delete + Klasse (A) Teil-Purge
 * (ADR 0006, „Löschstrategie"). Wiederverwendbares Primitive: kein CLI, keine
 * Route, keine UI — das entscheidet ein separater Schritt (Phase 7b/7c bauen
 * darauf auf).
 *
 * Was diese Funktion NICHT tut (bewusst out of scope):
 * - Fristbasierte Löschung abgeschlossener `training_assignments` nach
 *   Ablauf der Aufbewahrungsfrist (`lib/privacy/retention.ts`) — das ist
 *   Phase 7c (Cron/Reconcile), nicht Austritt/Self-Service.
 * - Keycloak/Identity-Löschung — separate Ebene (ADR 0006, „Identität vs.
 *   App-Daten"), nicht Sache dieses Moduls.
 */

import { and, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/lib/db/client";

/**
 * Anzahl gelöschter Zeilen pro Klasse-B-Tabelle (SQL-Tabellenname als Key,
 * siehe `lib/privacy/data-classes.ts`).
 */
export type ClassBDeletedCounts = {
  profiles: number;
  enrollments: number;
  lesson_progress: number;
  quiz_attempts: number;
  annotations: number;
  authoring_tokens: number;
};

export type PurgeReport = {
  userId: string;
  /** Gelöschte Zeilen pro Klasse-B-Tabelle. */
  deleted: ClassBDeletedCounts;
  /** Gelöschte OFFENE (`completed_at IS NULL`) training_assignments. */
  deletedOpenAssignmentsCount: number;
  /**
   * Behaltene ABGESCHLOSSENE (`completed_at IS NOT NULL`) training_assignments
   * — Nachweiswert, fristbasierte Löschung ist Sache von Phase 7c, nicht
   * dieser Funktion.
   */
  retainedNachweisCount: number;
};

/**
 * Löscht alle Klasse-(B)-Daten eines Users (ADR 0006) und die OFFENEN
 * (`completedAt IS NULL`) `training_assignments` — offene Zuweisungen haben
 * keinen Nachweiswert. Abgeschlossene `training_assignments`
 * (`completedAt IS NOT NULL`) bleiben stehen; deren fristbasierte Löschung
 * ist Sache von Phase 7c (Retention-Cron), NICHT dieser Funktion.
 *
 * Läuft in einer Transaktion (Drizzle/postgres-js unterstützt
 * `db.transaction`, siehe `lib/rag/indexing.ts` für das Bestandsmuster) —
 * entweder alles oder nichts, kein halb-gelöschter Zustand.
 *
 * Kein `console.log`: reines Primitive, der Aufrufer (späteres CLI/Route/
 * Reconcile) entscheidet über Logging/Audit-Trail rund um den Aufruf.
 */
export async function purgeUserData(userId: string): Promise<PurgeReport> {
  return db.transaction(async (tx) => {
    const [
      profilesDeleted,
      enrollmentsDeleted,
      lessonProgressDeleted,
      quizAttemptsDeleted,
      annotationsDeleted,
      authoringTokensDeleted,
    ] = await Promise.all([
      tx
        .delete(schema.profiles)
        .where(eq(schema.profiles.userId, userId))
        .returning({ userId: schema.profiles.userId }),
      tx
        .delete(schema.enrollments)
        .where(eq(schema.enrollments.userId, userId))
        .returning({ userId: schema.enrollments.userId }),
      tx
        .delete(schema.lessonProgress)
        .where(eq(schema.lessonProgress.userId, userId))
        .returning({ userId: schema.lessonProgress.userId }),
      tx
        .delete(schema.quizAttempts)
        .where(eq(schema.quizAttempts.userId, userId))
        .returning({ id: schema.quizAttempts.id }),
      tx
        .delete(schema.annotations)
        .where(eq(schema.annotations.userId, userId))
        .returning({ id: schema.annotations.id }),
      tx
        .delete(schema.authoringTokens)
        .where(eq(schema.authoringTokens.userId, userId))
        .returning({ id: schema.authoringTokens.id }),
    ]);

    const deletedOpenAssignments = await tx
      .delete(schema.trainingAssignments)
      .where(
        and(
          eq(schema.trainingAssignments.userId, userId),
          isNull(schema.trainingAssignments.completedAt),
        ),
      )
      .returning({ id: schema.trainingAssignments.id });

    const retainedRows = await tx
      .select({ id: schema.trainingAssignments.id })
      .from(schema.trainingAssignments)
      .where(eq(schema.trainingAssignments.userId, userId));

    const report: PurgeReport = {
      userId,
      deleted: {
        profiles: profilesDeleted.length,
        enrollments: enrollmentsDeleted.length,
        lesson_progress: lessonProgressDeleted.length,
        quiz_attempts: quizAttemptsDeleted.length,
        annotations: annotationsDeleted.length,
        authoring_tokens: authoringTokensDeleted.length,
      },
      deletedOpenAssignmentsCount: deletedOpenAssignments.length,
      retainedNachweisCount: retainedRows.length,
    };

    return report;
  });
}

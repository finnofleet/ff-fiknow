/**
 * Fristbasierter Retention-Purge Klasse (A) (ADR 0006, Phase 7c — Teil
 * „Retention"). Löscht abgeschlossene `training_assignments`-Zeilen, deren
 * Aufbewahrungsfrist (`lib/privacy/retention.ts`) abgelaufen ist — der Teil,
 * den `purgeUserData` (Austritt/Self-Service) bewusst NICHT übernimmt.
 *
 * Wiederverwendbares Primitive: kein CLI, keine Route, keine UI — das
 * entscheidet der Aufrufer (`scripts/retention-purge.ts` + K8s-CronJob).
 *
 * Abgrenzung (bewusst):
 * - Fasst NUR Klasse (A) / `training_assignments` an. Klasse (B) wird bei
 *   Austritt gelöscht (`purgeUserData`), nicht fristbasiert.
 * - Nur ABGESCHLOSSENE Zeilen (`completed_at IS NOT NULL`) sind
 *   nachweisrelevant und haben eine Frist. Offene Zuweisungen
 *   (`completed_at IS NULL`) sind laufende Pflichten, kein Nachweis — sie
 *   werden hier NIE angefasst.
 * - Payload-agnostisch: importiert nur den Drizzle-Client, kein Payload.
 */

import { and, isNotNull, lte, sql } from "drizzle-orm";

import { db, schema } from "@/lib/db/client";
import { RETENTION_YEARS, retentionCutoff } from "@/lib/privacy/retention";

export type RetentionPurgeReport = {
  /** Stichtag: `completed_at <= cutoff` galt als löschreif. */
  cutoff: Date;
  /** Verwendete Aufbewahrungsfrist in Jahren. */
  retentionYears: number;
  /** True → nichts gelöscht, nur gezählt (Vorschau). */
  dryRun: boolean;
  /**
   * Anzahl löschreifer Zeilen. Bei `dryRun` die hypothetische Anzahl, sonst
   * die tatsächlich gelöschte (identisch, da in derselben Transaktion
   * gezählt bzw. gelöscht).
   */
  count: number;
};

/**
 * Löscht (oder zählt bei `dryRun`) abgelaufene, abgeschlossene
 * `training_assignments`-Nachweise. Schreibt eine PII-freie Audit-Zeile in
 * `retention_purge_runs` (auch bei Dry-Run und bei count=0 — der Lauf selbst
 * ist der Rechenschafts-Beleg, ADR 0006).
 *
 * Alles in EINER Transaktion: Count/Delete + Audit-Insert sind atomar, kein
 * Beleg ohne passende Löschung und umgekehrt.
 *
 * `now` ist injizierbar (Default: aktueller Zeitpunkt) — deterministisch
 * testbar mit zurückdatierten Fixtures.
 */
export async function purgeExpiredNachweise(opts: {
  now?: Date;
  dryRun?: boolean;
  years?: number;
}): Promise<RetentionPurgeReport> {
  const now = opts.now ?? new Date();
  const dryRun = opts.dryRun ?? false;
  const years = opts.years ?? RETENTION_YEARS;
  const cutoff = retentionCutoff(now, years);

  return db.transaction(async (tx) => {
    const expiredWhere = and(
      isNotNull(schema.trainingAssignments.completedAt),
      lte(schema.trainingAssignments.completedAt, cutoff),
    );

    let count: number;
    if (dryRun) {
      const [row] = await tx
        .select({ c: sql<number>`count(*)::int` })
        .from(schema.trainingAssignments)
        .where(expiredWhere);
      count = Number(row?.c ?? 0);
    } else {
      const deleted = await tx
        .delete(schema.trainingAssignments)
        .where(expiredWhere)
        .returning({ id: schema.trainingAssignments.id });
      count = deleted.length;
    }

    await tx.insert(schema.retentionPurgeRuns).values({
      cutoffDate: cutoff,
      retentionYears: years,
      dryRun,
      deletedCount: count,
    });

    return { cutoff, retentionYears: years, dryRun, count };
  });
}

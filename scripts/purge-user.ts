/**
 * Admin/Ops-CLI für den lokalen Datenpurge eines Users (DSG Phase 7b, ADR 0006).
 *
 * Löscht Klasse-(B)-Daten + offene `training_assignments`; abgeschlossene
 * Nachweise bleiben (fristbasierte Löschung = Phase 7c). Identität in Keycloak
 * ist NICHT betroffen — das ist eine separate Ebene (ADR 0006).
 *
 * DRY-RUN ist Default: ohne `--confirm` wird nur angezeigt, WAS gelöscht würde.
 *
 * Usage:
 *   DATABASE_URL='postgres://…' npx tsx scripts/purge-user.ts <userId>
 *   DATABASE_URL='postgres://…' npx tsx scripts/purge-user.ts <userId> --confirm
 */
import { and, count, eq, isNotNull, isNull } from "drizzle-orm";

import { recordAudit } from "@/lib/audit/log";
import { db, schema } from "@/lib/db/client";
import { purgeUserData } from "@/lib/privacy/purge-user";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  console.error(
    "\nUsage: DATABASE_URL='…' npx tsx scripts/purge-user.ts <userId> [--confirm]",
  );
  process.exit(1);
}

async function countWhereUser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any,
  userId: string,
): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(table)
    .where(eq(table.userId, userId));
  return Number(row?.c ?? 0);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const confirm = args.includes("--confirm");
  const userId = args.find((a) => !a.startsWith("--"));

  if (!userId) fail("Kein userId angegeben.");
  if (!UUID_RE.test(userId)) fail(`userId ist keine gültige UUID: ${userId}`);

  // Preview (Klasse B + Assignments), ohne zu löschen.
  const [
    profiles,
    enrollments,
    lessonProgress,
    quizAttempts,
    annotations,
    authoringTokens,
  ] = await Promise.all([
    countWhereUser(schema.profiles, userId),
    countWhereUser(schema.enrollments, userId),
    countWhereUser(schema.lessonProgress, userId),
    countWhereUser(schema.quizAttempts, userId),
    countWhereUser(schema.annotations, userId),
    countWhereUser(schema.authoringTokens, userId),
  ]);

  const [openRow] = await db
    .select({ c: count() })
    .from(schema.trainingAssignments)
    .where(
      and(
        eq(schema.trainingAssignments.userId, userId),
        isNull(schema.trainingAssignments.completedAt),
      ),
    );
  const [completedRow] = await db
    .select({ c: count() })
    .from(schema.trainingAssignments)
    .where(
      and(
        eq(schema.trainingAssignments.userId, userId),
        isNotNull(schema.trainingAssignments.completedAt),
      ),
    );
  const openAssignments = Number(openRow?.c ?? 0);
  const completedAssignments = Number(completedRow?.c ?? 0);

  console.log(`\n=== Purge-Vorschau für User ${userId} ===`);
  console.log("Klasse B (wird gelöscht):");
  console.log(`  profiles:         ${profiles}`);
  console.log(`  enrollments:      ${enrollments}`);
  console.log(`  lesson_progress:  ${lessonProgress}`);
  console.log(`  quiz_attempts:    ${quizAttempts}`);
  console.log(`  annotations:      ${annotations}`);
  console.log(`  authoring_tokens: ${authoringTokens}`);
  console.log("training_assignments:");
  console.log(`  offen (wird gelöscht):        ${openAssignments}`);
  console.log(`  abgeschlossen (bleibt, 7c):   ${completedAssignments}`);

  if (!confirm) {
    console.log(
      "\n⚠ DRY-RUN — nichts gelöscht. Zum Ausführen erneut mit --confirm aufrufen.\n",
    );
    process.exit(0);
  }

  console.log("\n→ --confirm gesetzt, führe Purge aus …");
  const report = await purgeUserData(userId);
  console.log("✓ Purge abgeschlossen. Report:");
  console.log(JSON.stringify(report, null, 2));

  await recordAudit({
    action: "user.purge",
    actorUserId: null,
    source: "cli",
    targetType: "user",
    targetId: userId,
  });

  process.exit(0);
}

main().catch((err) => {
  console.error("✗ Purge fehlgeschlagen:", err);
  process.exit(1);
});

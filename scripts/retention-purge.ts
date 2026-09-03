/**
 * Ops-CLI + CronJob-Entrypoint für den fristbasierten Retention-Purge
 * (DSG Phase 7c — Teil „Retention", ADR 0006).
 *
 * Löscht abgeschlossene `training_assignments`, deren Aufbewahrungsfrist
 * (`FINKNOW_RETENTION_YEARS`, Default 3 J) abgelaufen ist. Klasse-(B)-Daten
 * und Keycloak/Identität sind NICHT betroffen — separate Ebenen (ADR 0006).
 *
 * DRY-RUN ist Default: ohne `--confirm` wird nur gezählt/angezeigt, WAS
 * gelöscht würde (die Audit-Zeile wird trotzdem geschrieben, mit dry_run=true).
 * Alternativ erzwingt `RETENTION_PURGE_DRY_RUN=1` einen Dry-Run auch mit
 * `--confirm` (Sicherheits-Override, z. B. für den ersten Prod-Rollout).
 *
 * Usage:
 *   DATABASE_URL='postgres://…' npx tsx scripts/retention-purge.ts
 *   DATABASE_URL='postgres://…' npx tsx scripts/retention-purge.ts --confirm
 *
 * Exit-Code: 0 bei Erfolg (auch count=0), 1 bei Fehler — der K8s-CronJob
 * wertet das als Job-Status.
 */
import { redactError } from "@/lib/log-redact";
import { purgeExpiredNachweise } from "@/lib/privacy/purge-expired";
import { SETTING_RETENTION_YEARS } from "@/lib/settings/registry";
import { getSettingValue } from "@/lib/settings/store";
import { RETENTION_YEARS } from "@/lib/privacy/retention";

async function main(): Promise<void> {
  const confirm = process.argv.includes("--confirm");
  const forcedDryRun =
    process.env.RETENTION_PURGE_DRY_RUN === "1" ||
    process.env.RETENTION_PURGE_DRY_RUN === "true";
  const dryRun = !confirm || forcedDryRun;

  if (!process.env.DATABASE_URL) {
    console.error("✗ DATABASE_URL ist nicht gesetzt.");
    process.exit(1);
  }

  // Frist aus den Policy-Einstellungen (DB) — der DSB kann sie ohne Deploy
  // anpassen. Fallback bleibt `FINKNOW_RETENTION_YEARS` bzw. der Default,
  // siehe lib/settings/registry.ts.
  const years = await getSettingValue(SETTING_RETENTION_YEARS);

  const mode = dryRun ? "DRY-RUN (nichts wird gelöscht)" : "APPLY (löscht)";
  console.log(`▶ Retention-Purge — ${mode}`);
  console.log(
    `  Frist: ${years} Jahr(e)` +
      (years === RETENTION_YEARS
        ? ""
        : ` (Einstellung überschreibt FINKNOW_RETENTION_YEARS=${RETENTION_YEARS})`),
  );
  if (confirm && forcedDryRun) {
    console.log("  ⚠ --confirm durch RETENTION_PURGE_DRY_RUN übersteuert.");
  }

  const report = await purgeExpiredNachweise({ dryRun, years });

  console.log(
    JSON.stringify(
      {
        mode: dryRun ? "dry-run" : "apply",
        cutoff: report.cutoff.toISOString(),
        retentionYears: report.retentionYears,
        deletedCount: report.count,
      },
      null,
      2,
    ),
  );
  console.log(
    dryRun
      ? `✓ ${report.count} Zeile(n) WÄREN löschreif (Stichtag ${report.cutoff.toISOString()}).`
      : `✓ ${report.count} Zeile(n) gelöscht (Stichtag ${report.cutoff.toISOString()}).`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("✗ Retention-Purge fehlgeschlagen:", redactError(err));
    process.exit(1);
  });

/**
 * I/O-Loader der Datenqualitäts-Kennzahl für die Scope-Achsen
 * (ADR 0007 §3, Claim-Gate). Reine Zähl-Logik: `entity-coverage-compute.ts`.
 *
 * **Warum das sichtbar sein muss.** Der Scope-Filter ist strikt: ein gesetzter
 * Scope trifft eine Person mit `land`/`bu = null` NIE (`passesEntityScope`).
 * Eine Person ohne auflösbare Zuordnung fällt damit aus jeder scoped
 * Auswertung heraus — lautlos, ohne Fehler, mit unverändert grüner
 * Erfüllungsquote. Für einen Nachweis ist ein stilles Untererfassen der
 * schlimmere Fehler als eine zu weite Sicht: niemand sieht, dass jemand
 * fehlt. Diese Kennzahl macht genau das im Dashboard sichtbar, damit die
 * Lücke nicht erst bei einem Audit auffällt.
 *
 * Bezugsmenge sind bewusst NUR Personen mit mindestens einer
 * Pflichtzuweisung — wer keinen Pflichtkurs hat, fehlt in keinem Nachweis
 * und ist keine Lücke.
 *
 * Bewusst getrennt von der k-anonymisierten Aggregat-Sicht
 * (`compliance-aggregate-compute.ts`, Bucket `LAND_UNASSIGNED`): dort
 * unterdrückt die k-Anonymität (< 5) kleine Buckets, sodass gerade eine
 * kleine Zahl unzugeordneter Personen unsichtbar bliebe. Diese Kennzahl ist
 * kurs-unabhängig und damit nicht personenbeziehbar — sie zählt nur, wie
 * viele Profile unvollständig sind.
 *
 * Läuft wie die übrigen Compliance-Loader über die privilegierte
 * Server-`db`-Connection (RLS-Bypass) und liest daher bewusst ALLE Profile.
 */
import { db } from "@/lib/db/client";
import { profiles, trainingAssignments } from "@/lib/db/schema";
import { redactError } from "@/lib/log-redact";

import {
  computeEntityCoverage,
  type EntityCoverage,
} from "./entity-coverage-compute";

export type { EntityCoverage };

/**
 * Zählt die unvollständigen Scope-Zuordnungen. Best-effort: schlägt die
 * Abfrage fehl, wird `null` zurückgegeben und die Anzeige entfällt — eine
 * Datenqualitäts-Kennzahl darf das Dashboard nie zum Absturz bringen.
 */
export async function getEntityCoverage(): Promise<EntityCoverage | null> {
  try {
    const assignedUsers = await db
      .selectDistinct({ userId: trainingAssignments.userId })
      .from(trainingAssignments);
    if (assignedUsers.length === 0) {
      return { withAssignments: 0, missingLand: 0, missingBu: 0 };
    }

    const profileRows = await db
      .select({
        userId: profiles.userId,
        land: profiles.land,
        bu: profiles.bu,
      })
      .from(profiles);

    return computeEntityCoverage({
      assignedUserIds: assignedUsers.map((r) => r.userId),
      byUser: new Map(
        profileRows.map((r) => [r.userId, { land: r.land, bu: r.bu }]),
      ),
    });
  } catch (err) {
    console.error(
      "[training/entity-coverage] getEntityCoverage fehlgeschlagen",
      redactError(err),
    );
    return null;
  }
}

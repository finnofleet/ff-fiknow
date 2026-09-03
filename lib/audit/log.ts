/**
 * Zentraler append-only Audit-Writer (ADR 0007 §11).
 *
 * `recordAudit` ist BEST-EFFORT: ein Fehlschlag beim Schreiben darf die
 * eigentliche Aktion (Publish, Reindex, Purge, …) NIE zum Absturz bringen —
 * Fehler werden geloggt, dann geschluckt (analog reconcileAssignments).
 *
 * PII-Freiheit by construction: die Signatur akzeptiert NUR die strukturierten
 * Felder aus `audit_log` — es gibt bewusst kein freies Payload-/jsonb-Feld,
 * in dem versehentlich sensible Rohdaten landen koennten.
 */
import { db } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";
import { redactError } from "@/lib/log-redact";

/** Herkunft der Aktion. */
export type AuditSource = "session" | "authoring-token" | "cli" | "system";

/**
 * Feature-Flag fuer das Compliance-ZUGRIFFS-Logging (ADR 0007 §11): zu
 * protokollieren, WER Nachweise einsieht, ist selbst Beschaeftigten-
 * Ueberwachung (§ 87 Abs. 1 Nr. 6 BetrVG) und daher mitbestimmungspflichtig.
 * Bis zur BR-Freigabe bleibt es DEAKTIVIERT (Default aus). Authoring-/Admin-
 * Logging (P4a) ist davon NICHT betroffen und laeuft immer.
 */
export function complianceAuditEnabled(): boolean {
  return process.env.AUDIT_COMPLIANCE_ACCESS === "true";
}

/** Wer die Aktion ausloest — durch die Authoring-Funktionen gereicht. */
export type AuditActor = {
  userId: string | null;
  role: string | null;
  source: AuditSource;
};

export type AuditEntry = {
  /** Kanonische Aktion, Konvention `<domain>.<verb>` (z. B. "course.publish"). */
  action: string;
  actorUserId?: string | null;
  actorRole?: string | null;
  source?: AuditSource | null;
  targetType?: string | null;
  targetId?: string | null;
  land?: string | null;
  bu?: string | null;
};

export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLog).values({
      action: entry.action,
      actorUserId: entry.actorUserId ?? null,
      actorRole: entry.actorRole ?? null,
      source: entry.source ?? null,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      land: entry.land ?? null,
      bu: entry.bu ?? null,
    });
  } catch (err) {
    console.error("[audit] recordAudit fehlgeschlagen (geschluckt)", redactError(err));
  }
}

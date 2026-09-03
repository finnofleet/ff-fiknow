/**
 * I/O-Schicht der Policy-Einstellungen. Reine Deklaration/Validierung:
 * `registry.ts`.
 *
 * Jede Änderung schreibt eine Audit-Zeile (`setting.changed`) — das ist der
 * eigentliche Grund, diese Werte in der DB statt in Env-Vars zu halten: eine
 * Frist zu verkürzen ist eine Entscheidung mit rechtlichem Gewicht und soll
 * nachvollziehbar sein, mit handelnder Person und Zeitpunkt.
 *
 * Kein Cache: die Einstellungen werden selten gelesen (Admin-UI, nächtlicher
 * Purge), und ein Cache wäre hier genau die Sorte Zustand, die stillschweigend
 * veraltet — eine Frist, die noch mit dem alten Wert läuft, obwohl die
 * Anzeige den neuen zeigt, wäre schlimmer als ein Query pro Aufruf.
 */
import { eq } from "drizzle-orm";

import { recordAudit } from "@/lib/audit/log";
import { db } from "@/lib/db/client";
import { settings } from "@/lib/db/schema";
import { redactError } from "@/lib/log-redact";

import {
  resolveSetting,
  SETTING_DEFS,
  type SettingDef,
  type SettingSource,
} from "./registry";

export type ResolvedSetting = {
  def: SettingDef;
  value: number;
  source: SettingSource;
  updatedAt: Date | null;
  updatedBy: string | null;
};

/** Rohe DB-Werte, auf deklarierte Keys beschränkt. */
async function readRawSettings(): Promise<
  Map<string, { value: string; updatedAt: Date; updatedBy: string | null }>
> {
  const rows = await db
    .select({
      key: settings.key,
      value: settings.value,
      updatedAt: settings.updatedAt,
      updatedBy: settings.updatedBy,
    })
    .from(settings);
  const map = new Map<
    string,
    { value: string; updatedAt: Date; updatedBy: string | null }
  >();
  for (const row of rows) {
    // Unbekannte Keys ignorieren — der Schluesselraum ist code-fest.
    if (!SETTING_DEFS[row.key]) continue;
    map.set(row.key, {
      value: row.value,
      updatedAt: row.updatedAt,
      updatedBy: row.updatedBy,
    });
  }
  return map;
}

/** Alle deklarierten Einstellungen mit wirksamem Wert + Herkunft. */
export async function getResolvedSettings(): Promise<ResolvedSetting[]> {
  const raw = await readRawSettings();
  return Object.values(SETTING_DEFS).map((def) => {
    const row = raw.get(def.key);
    const { value, source } = resolveSetting(
      def,
      row?.value ?? null,
      def.envVar ? process.env[def.envVar] : null,
    );
    return {
      def,
      value,
      source,
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updatedBy ?? null,
    };
  });
}

/**
 * Wirksamer Wert EINER Einstellung. Best-effort: schlägt der DB-Read fehl,
 * wird auf Env/Default zurückgefallen statt zu werfen — ein Cron-Job darf
 * nicht daran scheitern, dass die Settings-Tabelle kurz nicht lesbar ist.
 * Der Default ist der konservative, bekannte Wert.
 */
export async function getSettingValue(key: string): Promise<number> {
  const def = SETTING_DEFS[key];
  if (!def) throw new Error(`Unbekannte Einstellung "${key}".`);
  try {
    const [row] = await db
      .select({ value: settings.value })
      .from(settings)
      .where(eq(settings.key, key))
      .limit(1);
    return resolveSetting(
      def,
      row?.value ?? null,
      def.envVar ? process.env[def.envVar] : null,
    ).value;
  } catch (err) {
    console.error(
      `[settings] Lesen von "${key}" fehlgeschlagen — Fallback auf Env/Default`,
      redactError(err),
    );
    return resolveSetting(
      def,
      null,
      def.envVar ? process.env[def.envVar] : null,
    ).value;
  }
}

/**
 * Setzt eine Einstellung und protokolliert die Änderung. Wirft bei
 * unbekanntem Key oder ungültigem Wert — anders als beim LESEN ist ein
 * ungültiger Wert hier ein Bedienfehler, der dem Aufrufer gehört und nicht
 * still auf einen Default fallen darf.
 */
export async function setSettingValue(
  key: string,
  rawValue: string,
  actor: { userId: string; role: string },
): Promise<void> {
  const def = SETTING_DEFS[key];
  if (!def) throw new Error(`Unbekannte Einstellung "${key}".`);

  const n = Number(rawValue);
  if (!Number.isFinite(n)) {
    throw new Error(`"${rawValue}" ist keine Zahl.`);
  }
  if (n < def.min || n > def.max) {
    throw new Error(
      `Wert muss zwischen ${def.min} und ${def.max} ${def.unit} liegen.`,
    );
  }

  const value = String(n);
  await db
    .insert(settings)
    .values({ key, value, updatedBy: actor.userId, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedBy: actor.userId, updatedAt: new Date() },
    });

  // Der neue Wert steht im `target_id` — er ist keine Personen-, sondern eine
  // Policy-Angabe, das Log bleibt damit PII-frei (ADR 0007 §11).
  await recordAudit({
    action: "setting.changed",
    actorUserId: actor.userId,
    actorRole: actor.role,
    source: "session",
    targetType: `setting:${key}`,
    targetId: value,
  });
}

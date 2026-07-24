/**
 * Datenklassen für Aufbewahrung & Löschung (ADR 0006) — reine Klassifikation,
 * KEIN I/O, KEINE Payload-Imports. Frontend-unabhängig, damit CLI/Route/UI
 * (spätere, separate Schritte) dieselbe Wahrheit referenzieren statt sie zu
 * duplizieren.
 *
 * Leitprinzip (ADR 0006, „Leitprinzip: zwei Datenklassen"):
 *
 * - Klasse (A) — Nachweis-relevant, aufbewahrungspflichtig bis Fristablauf
 *   (Art. 6 Abs. 1 lit. f + Art. 17 Abs. 3 lit. e DSGVO). Genau eine Tabelle:
 *   `training_assignments` — append-only Compliance-Audit-Trail (ADR 0005).
 *
 * - Klasse (B) — nicht nachweispflichtig, bei Austritt/auf Verlangen ohne
 *   Vorhaltung löschbar. Alle übrigen user-bezogenen Tabellen:
 *   `profiles`, `enrollments`, `lesson_progress`, `quiz_attempts`,
 *   `annotations`, `authoring_tokens`.
 *
 * Die Namen hier sind die SQL-Tabellennamen (`pgTable`-erster Parameter in
 * `lib/db/schema.ts`), nicht die Drizzle-Exportnamen — das hält diese Datei
 * unabhängig von Drizzle/Schema-Imports und damit von jeglichem DB-Modulgraph
 * (Vorgabe: entry-point-agnostischer Kern, kein DB-Zugriff nötig, um sie zu
 * lesen oder zu testen).
 */

/** Klasse (A): Nachweis-relevant, fristbasiert aufzubewahren (ADR 0006). */
export const CLASS_A_TABLES = ["training_assignments"] as const;

/** Klasse (B): nicht nachweispflichtig, bei Austritt/Verlangen löschbar (ADR 0006). */
export const CLASS_B_TABLES = [
  "profiles",
  "enrollments",
  "lesson_progress",
  "quiz_attempts",
  "annotations",
  "authoring_tokens",
] as const;

export type ClassATable = (typeof CLASS_A_TABLES)[number];
export type ClassBTable = (typeof CLASS_B_TABLES)[number];
export type DataClass = "A" | "B";

/**
 * Klassifiziert einen SQL-Tabellennamen nach ADR 0006. `null`, wenn die
 * Tabelle nicht in die Klassifikation fällt (z. B. `lesson_chunks`,
 * `course_index_state` — Content-Index, kein personenbezogener Nutzerdatensatz).
 */
export function classifyTable(tableName: string): DataClass | null {
  if ((CLASS_A_TABLES as readonly string[]).includes(tableName)) return "A";
  if ((CLASS_B_TABLES as readonly string[]).includes(tableName)) return "B";
  return null;
}

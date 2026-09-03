/**
 * Redaktion von Fehlerobjekten fuer Logs.
 *
 * **Warum.** Ein Postgres-Fehler (postgres.js) traegt neben `message` auch
 * `detail`, `where`, `query` und `parameters`. `detail` enthaelt bei
 * Constraint-Verletzungen die beteiligten SPALTENWERTE — etwa
 * „Key (user_id, source_type, source_id, cycle)=(a1b2…, role, …) already
 * exists". Wird so ein Objekt roh an `console.error` gereicht, landen diese
 * Rohwerte im Container-Log. Das ist der einzige Pfad, auf dem
 * Personen-Identifikatoren aus der DB in die Logs gelangen — und der
 * Leserkreis der Container-Logs (Betrieb/Cluster) ist ein anderer und
 * groesserer als der von DB-Zugriffen.
 *
 * Deshalb: nur `name`, `code` und `message` loggen. Das reicht fuer die
 * Diagnose (welcher Fehler, welche Constraint), ohne die Werte.
 *
 * Bewusst I/O-freies Leaf-Modul — ohne Runtime unit-testbar.
 */

/** Auf Log-sichere Felder reduzierter Fehler. */
export type RedactedError = {
  name: string;
  /** Postgres-SQLSTATE bzw. Node-Fehlercode, falls vorhanden. */
  code?: string;
  message: string;
};

/**
 * Reduziert einen unbekannten Fehlerwert auf die log-sicheren Felder.
 * Nicht-Error-Werte werden gestringifiziert (ohne Struktur zu erhalten, die
 * Rohdaten tragen koennte).
 */
export function redactError(err: unknown): RedactedError {
  if (err instanceof Error) {
    const code = (err as { code?: unknown }).code;
    return {
      name: err.name,
      ...(typeof code === "string" && code ? { code } : {}),
      message: err.message,
    };
  }
  // Kein Error-Objekt: nur den Typ nennen, NICHT den Wert — ein geworfenes
  // Objekt koennte selbst Rohdaten sein.
  return { name: typeof err, message: String(err).slice(0, 200) };
}

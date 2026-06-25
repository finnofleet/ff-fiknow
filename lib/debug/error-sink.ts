/**
 * In-Memory-Ring-Buffer für Server-Fehler.
 *
 * Zweck: Stacktraces von 500ern auslesbar machen OHNE Container-Log-Zugriff.
 * `instrumentation.ts onRequestError` schreibt hier rein, der gesicherte
 * Endpoint `/api/debug/last-errors` liest aus.
 *
 * Bewusst nur im RAM (kein DB-Write): es gibt genau EINE App-Node (keine
 * Mehrfachinstanz), und die letzten N Fehler reichen zur Diagnose. Buffer
 * geht beim Neustart verloren — das ist ok, wir debuggen frische 500er.
 *
 * Der Buffer hängt an globalThis, damit verschiedene Bundle-Kopien desselben
 * Moduls (Instrumentation- vs. Route-Kontext) wirklich denselben Speicher
 * teilen.
 */
export type CapturedError = {
  time: string;
  message: string;
  stack: string | null;
  digest: string | null;
  path: string | null;
  method: string | null;
  routeType: string | null;
};

const MAX_ENTRIES = 25;
const GLOBAL_KEY = "__eduErrorSink__";

function buffer(): CapturedError[] {
  const g = globalThis as Record<string, unknown>;
  if (!Array.isArray(g[GLOBAL_KEY])) {
    g[GLOBAL_KEY] = [];
  }
  return g[GLOBAL_KEY] as CapturedError[];
}

export function recordError(entry: CapturedError): void {
  const buf = buffer();
  buf.push(entry);
  while (buf.length > MAX_ENTRIES) buf.shift();
}

/** Neueste zuerst. */
export function getRecordedErrors(): CapturedError[] {
  return [...buffer()].reverse();
}

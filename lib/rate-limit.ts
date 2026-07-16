/**
 * In-Memory-Rate-Limiter (Fixed-Window, pro Prozess).
 *
 * SECURITY_AUDIT Finding 11: bremst die Frequenz auf den compile-/render-
 * intensiven Authoring-Endpoints (Import, Export, Publish). Size-Cap +
 * Compile-Timeout begrenzen bereits *einen* Request; dies begrenzt die
 * *Anzahl* pro Zeitfenster.
 *
 * Bewusst in-memory, NICHT Redis: die Endpoints sind curator/admin-only
 * (kein anonymer Angreifer) und die Plattform hat wenige Nutzer. Der
 * „pro-Replika statt global"-Nachteil ist hier irrelevant — bei N Replikas
 * gilt effektiv N×Limit, was für den Hygiene-Zweck genügt. Keine externe
 * Abhängigkeit, kein Secret pro Deployment (verstande.ch, fiknow).
 *
 * Trade-off Fixed-Window: an der Fenstergrenze sind theoretisch bis zu
 * 2×limit Requests in kurzer Folge möglich. Für reines Frequenz-Capping
 * (kein Fairness-SLA) akzeptabel und deutlich simpler als ein Sliding-Log.
 */

interface Bucket {
  count: number;
  /** Epoch-ms, ab dann beginnt ein frisches Fenster. */
  resetAt: number;
}

/**
 * Obergrenze getrackter Keys — verhindert, dass die Map selbst zum
 * Memory-DoS-Vektor wird (viele unterschiedliche Keys). Bei Überschreitung
 * werden abgelaufene Buckets weggeräumt, bevor ein neuer angelegt wird.
 */
const MAX_TRACKED_KEYS = 10_000;

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  /** true = Request erlaubt; false = Limit überschritten (→ 429). */
  ok: boolean;
  limit: number;
  /** Verbleibende Requests im aktuellen Fenster (>= 0). */
  remaining: number;
  /** Epoch-ms, wann das Fenster zurücksetzt. */
  resetAt: number;
  /** Sekunden bis zum Reset — für den Retry-After-Header. */
  retryAfterSec: number;
}

/**
 * Zählt einen Treffer für `key` und meldet, ob er noch im Limit liegt.
 *
 * @param key      Eindeutiger Bucket-Schlüssel, z. B. `"import:<userId>"`.
 *                 Pro Endpoint namespacen, damit Limits sich nicht teilen.
 * @param limit    Maximale Requests pro Fenster.
 * @param windowMs Fensterlänge in Millisekunden.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    // Abgelaufenes oder neues Fenster. Vor dem Anlegen ggf. aufräumen.
    if (!bucket && buckets.size >= MAX_TRACKED_KEYS) {
      sweepExpired(now);
    }
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }

  bucket.count += 1;

  const ok = bucket.count <= limit;
  const remaining = Math.max(0, limit - bucket.count);
  const retryAfterSec = Math.max(0, Math.ceil((bucket.resetAt - now) / 1000));

  return { ok, limit, remaining, resetAt: bucket.resetAt, retryAfterSec };
}

/** Entfernt alle abgelaufenen Buckets. Lazy, nur bei Key-Druck aufgerufen. */
function sweepExpired(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/** Nur für Tests/Probes — setzt den gesamten Zustand zurück. */
export function __resetRateLimitForTests(): void {
  buckets.clear();
}

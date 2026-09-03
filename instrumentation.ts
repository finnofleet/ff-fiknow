/**
 * Next.js Instrumentation-Hook — läuft einmal pro Server-Boot.
 *
 * Hier triggern wir den DB-Bootstrap beim Start: Schema-Migrationen
 * (Drizzle + auth-Schema-Bootstrap + Payload) UND die DB-Initializer
 * (Inhalte, z. B. die Rollen-Matrix), gegen die in DATABASE_URL
 * konfigurierte DB. Damit kommt jede neue Deployment-Instanz vollständig
 * hoch, ohne manuelle Bootstrap-Schritte.
 *
 * Siehe lib/db/auto-migrate.ts für Details + die zwei unabhängigen
 * Skip-Flags (SKIP_MIGRATIONS / SKIP_DB_INIT).
 *
 * Edge-Runtime bekommt das nicht — wir gucken auf NEXT_RUNTIME=nodejs.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // SECURITY_AUDIT Finding 8 — Fail-fast statt mit leerem JWT-Secret laufen.
  // Bewusst HIER und nicht in payload.config.ts: die Config wird auch beim
  // `next build` evaluiert (wo das Runtime-Secret legitim fehlt). Dieser
  // Guard betrifft nur den echten Server-Boot, bricht den Build also nicht.
  if (!process.env.PAYLOAD_SECRET) {
    throw new Error(
      "PAYLOAD_SECRET ist nicht gesetzt — Server-Start abgebrochen. Ohne " +
        "Secret liefe Payload mit leerem JWT-Secret (Token-Forgery möglich). " +
        "Env-Var im Container bzw. .env.local setzen.",
    );
  }

  // Geordneter Shutdown (DB-Pool-Drain) zusätzlich zu Next's HTTP-Graceful.
  const { registerGracefulShutdown } = await import("./lib/shutdown");
  registerGracefulShutdown();

  const { runDbBootstrap } = await import("./lib/db/auto-migrate");
  await runDbBootstrap();
}

/**
 * Fängt JEDEN Server-Fehler (RSC-Render, Route-Handler, Server-Action) ab und
 * legt Message + Stacktrace im In-Memory-Sink ab — auslesbar via
 * `/api/debug/last-errors`, ohne Container-Log-Zugriff. Nur erfassen, nie
 * den Request beeinflussen.
 */
export async function onRequestError(
  error: unknown,
  request: { path?: string; method?: string },
  context: { routeType?: string },
): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { recordError } = await import("./lib/debug/error-sink");
    const err = error as {
      message?: string;
      stack?: string;
      digest?: string;
    };
    recordError({
      time: new Date().toISOString(),
      message: err?.message ?? String(error),
      stack: err?.stack ?? null,
      digest: err?.digest ?? null,
      path: request?.path ?? null,
      method: request?.method ?? null,
      routeType: context?.routeType ?? null,
    });
  } catch {
    // Fehler-Erfassung darf selbst niemals den Request killen.
  }
}

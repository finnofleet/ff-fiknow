/**
 * Geordneter Shutdown auf SIGTERM/SIGINT.
 *
 * Next.js' Standalone-Server (start-server.js) registriert bereits eigene
 * SIGTERM/SIGINT-Handler, die KEINE neuen Verbindungen mehr annehmen, laufende
 * Requests abschliessen (`server.close`), den Next-Server schliessen und dann
 * mit Exit-Code 143/130 beenden. Den HTTP-Teil müssen wir also NICHT selbst
 * bauen.
 *
 * Was Next NICHT kennt, ist unser Datenbank-Pool. Diese Funktion hängt sich
 * zusätzlich an dieselben Signale und schliesst den postgres-js-Pool geordnet
 * (Terminate an Postgres → Connection-Slots sofort frei). Wichtig bei Rolling
 * Deployments / Pod-Evictions auf Managed-Postgres mit begrenztem
 * max_connections.
 *
 * Bewusst KEIN process.exit() hier — der Exit gehört Next. Wir laufen nur
 * nebenläufig zu dessen Cleanup; da Next vor dem Exit mehrere await-Punkte hat
 * (server.close, nextServer.close, Trace-Flush), bleibt genug Zeit, den Pool
 * zu drainen.
 */
import { closeDb } from "./db/client";

const LOG_PREFIX = "[shutdown]";
let registered = false;
let draining = false;

async function drain(signal: string): Promise<void> {
  if (draining) return;
  draining = true;
  console.log(`${LOG_PREFIX} ${signal} empfangen — schliesse DB-Pool …`);
  try {
    await closeDb();
    console.log(`${LOG_PREFIX} DB-Pool geschlossen.`);
  } catch (err) {
    // Cleanup darf den Shutdown niemals blockieren/crashen.
    console.error(`${LOG_PREFIX} Fehler beim Schliessen des DB-Pools:`, err);
  }
}

export function registerGracefulShutdown(): void {
  if (registered) return;
  registered = true;
  process.once("SIGTERM", () => void drain("SIGTERM"));
  process.once("SIGINT", () => void drain("SIGINT"));
}

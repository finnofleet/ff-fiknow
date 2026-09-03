/**
 * Initializer: Legacy-Rollenwert `editor` → `curator` normalisieren.
 *
 * `editor` stammt aus der Zeit vor Keycloak, als die App ihre Nutzer selbst
 * verwaltete. Seither hat `normalizeRole` den Wert im Code abgefangen — die
 * Kommentare in `lib/auth/roles.ts` und `lib/db/schema.ts` empfahlen seit
 * jeher, ihn „bei Gelegenheit" per UPDATE zu bereinigen. Das ist diese
 * Gelegenheit: ein Initializer ist genau der Ort für „zieht nach, was fehlt".
 *
 * **Warum nicht einfach den Code-Zweig löschen.** Ohne vorherige
 * Normalisierung würde eine verbliebene `editor`-Zeile auf den defensiven
 * Default `learner` fallen — also eine STILLE HERABSTUFUNG. Besonders
 * heikel, weil `backfill-role-keys` die Rollen-Menge aus genau diesem Wert
 * ableitet: aus `editor` würde dann dauerhaft eine Lerner-Menge, ohne dass
 * jemand es merkt. Deshalb erst die Daten bereinigen, dann den Zweig
 * entfernen — und dieser Initializer läuft VOR dem Backfill.
 *
 * Idempotent: trifft nach dem ersten Lauf keine Zeilen mehr.
 */
import { eq } from "drizzle-orm";

import { profiles } from "@/lib/db/schema";

import type { InitializerDb } from "./index";

export async function normalizeLegacyRoles(
  db: InitializerDb,
): Promise<string> {
  const updated = await db
    .update(profiles)
    .set({ role: "curator" })
    .where(eq(profiles.role, "editor"))
    .returning({ userId: profiles.userId });

  return updated.length === 0
    ? "keine Legacy-Rollenwerte"
    : `${updated.length} Profil(e) von "editor" auf "curator" normalisiert`;
}

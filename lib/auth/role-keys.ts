/**
 * Auflösung der IdP-Rollen-Keys gegen die Rollen-Matrix (ADR 0007 §2).
 *
 * Keycloak liefert pro Person beliebig viele Rollen/Gruppen. `profiles.role`
 * kann davon nur EINE halten (linearer Rang, `role-map.ts`) — diese Schicht
 * hält die volle Menge fest, aus der die effektiven Capabilities als
 * Vereinigung entstehen. Damit sind orthogonale Rollen ausdrückbar
 * („Admin UND Compliance-Einsicht"), ohne sie in eine Hierarchie zu pressen,
 * in die sie nicht gehören.
 *
 * **Direkter Abgleich gegen `roles.key`, bewusst ohne Zwischen-Map.** Die
 * Rollen-Matrix ist admin-editierbar; wer eine Keycloak-Gruppe anbinden will,
 * legt eine Rolle mit genau diesem Key an. Ein zusätzliches Env-Mapping wäre
 * eine dritte Stelle, an der Namen auseinanderlaufen können — die Matrix
 * selbst ist die Stelle, an der das Mapping ohnehin gepflegt wird.
 *
 * **Nur BEKANNTE Keys werden übernommen.** Ein IdP liefert typischerweise
 * viele Gruppen, die diese App nichts angehen; die dürfen nicht in unserer DB
 * landen (kein Abbild fremder Org-Struktur, kein Rauschen, keine Rechte aus
 * Zufallstreffern). Unbekannte Keys werden still verworfen — dieselbe
 * defensive Linie wie bei `capabilitiesForRoleKeys` und `mergeDbCapabilities`.
 *
 * **Die RANG-ROLLEN-NAMEN sind hier ausgeschlossen** (`learner`, `curator`,
 * `admin`, `suspended` — `ALL_ROLES`). Sonst gäbe es eine Rechte-Eskalation:
 * `extractRoleKeys` nimmt von Gruppen auch das letzte Pfadsegment auf
 * (`/Irgendwas/Admin` → `admin`), und genau so heißt die Rolle in der Matrix.
 * Eine fachlich völlig unbeteiligte Keycloak-Gruppe würde damit volle
 * Admin-Rechte verleihen. Diese vier Namen kommen deshalb AUSSCHLIESSLICH
 * über das explizite `OIDC_ROLE_MAP` (→ Rang-Rolle), nie über einen
 * Gruppen-Treffer.
 *
 * Bewusst NICHT `isSystem` als Filter: dieses Flag sagt „der Code besitzt die
 * Capabilities dieser Rolle" (→ Initializer gleicht sie ab) und hat mit
 * IdP-Matchbarkeit nichts zu tun. Beides an einem Flag hängen zu lassen hieße,
 * dass eine code-deklarierte Rolle — etwa die Compliance-Rolle — nie aus einer
 * Keycloak-Gruppe auflösbar wäre. Die Gefahr sind die kurzen, generischen
 * Rang-Namen, nicht die Eigentümerschaft.
 */
import { notInArray } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { roles } from "@/lib/db/schema";

import { ALL_ROLES } from "./roles";
import { redactError } from "@/lib/log-redact";

/**
 * Rollen-Keys, die JEDE Person mit Zugang traegt — unabhaengig vom IdP.
 *
 * `learner` ist der implizite Grundzustand („lernen duerfen ist kein
 * gewaehrtes Recht", siehe `canLearn`), nicht etwas, das jemand zugewiesen
 * bekommt. Deshalb app-seitig gesetzt und NICHT als Keycloak-Default-Rolle:
 * waere es eine IdP-Rolle, wuerde eine Aenderung an den Realm-Defaults dazu
 * fuehren, dass niemand mehr Lernender ist — und damit still niemand mehr
 * Pflichtschulungen zugewiesen bekommt. Diese Richtung des Fehlers
 * (Unter-Erfassung im Nachweis) ist die gefaehrliche.
 */
const IMPLICIT_ROLE_KEYS = ["learner"] as const;

/**
 * Verschachtelung der Rang-Rollen als DATEN statt als Zahlenvergleich: wer
 * `admin` ist, ist fachlich auch Kurator:in. Frueher steckte das in
 * `ROLE_RANK` + `roleMeetsTarget` („diese Rolle ODER hoeher") — ein TOTALER
 * Ordnungsbegriff, der nur funktioniert, solange alle Rollen ineinander
 * liegen. Orthogonale Rollen (Compliance) passten da nicht hinein. Hier steht
 * nur noch die eine Implikation, die tatsaechlich gilt.
 */
const ROLE_IMPLIES: Record<string, readonly string[]> = {
  admin: ["curator"],
};

/**
 * Vollstaendige Key-Menge einer Person: die Rang-Rolle aus dem
 * `OIDC_ROLE_MAP` (vertrauenswuerdig, darf ein Rang-Name sein), was sie
 * impliziert, die impliziten Keys und die aus Keycloak-Gruppen aufgeloesten
 * Keys. Reine Mengenlogik, keine Reihenfolge, kein Rang.
 */
export function completeRoleKeys(
  rankRole: string,
  matchedKeys: string[],
): string[] {
  // `suspended` ist ein Status, keine Rolle: ein gesperrtes Konto traegt GAR
  // KEINE Keys — auch nicht den impliziten `learner`. Sonst wuerde es weiter
  // als Ziel von Pflichtschulungen gelten (Deny-all heisst Deny-all).
  if (rankRole === "suspended") return [];

  const keys = new Set<string>(IMPLICIT_ROLE_KEYS);
  keys.add(rankRole);
  for (const implied of ROLE_IMPLIES[rankRole] ?? []) keys.add(implied);
  for (const key of matchedKeys) keys.add(key);
  return [...keys];
}

/**
 * Was sich an der Key-Menge einer Person geaendert hat. Reine Mengenlogik,
 * damit der Aufrufer nur noch protokollieren muss.
 */
export function diffRoleKeys(
  previous: string[] | null,
  next: string[],
): { added: string[]; removed: string[] } {
  const before = new Set(previous ?? []);
  const after = new Set(next);
  return {
    added: [...after].filter((k) => !before.has(k)).sort(),
    removed: [...before].filter((k) => !after.has(k)).sort(),
  };
}

/**
 * Schneidet die aus den Claims extrahierten Keys mit den in `roles`
 * gepflegten Keys. Rückgabe in der Schreibweise der DB (nicht der des
 * Tokens), damit der spätere Lookup exakt matcht.
 *
 * Wirft NICHT: schlägt der Read fehl, kommt `null` zurück — der Aufrufer
 * schreibt dann nichts, statt eine bestehende Key-Menge mit einer leeren zu
 * überschreiben. Ein DB-Aussetzer darf niemandem die Rechte entziehen.
 */
export async function resolveKnownRoleKeys(
  candidates: string[],
): Promise<string[] | null> {
  if (candidates.length === 0) return [];
  try {
    const rows = await db
      .select({ key: roles.key })
      .from(roles)
      .where(notInArray(roles.key, [...ALL_ROLES]));
    const wanted = new Set(candidates.map((c) => c.trim().toLowerCase()));
    return rows.filter((r) => wanted.has(r.key.toLowerCase())).map((r) => r.key);
  } catch (err) {
    console.error(
      "[auth/role-keys] resolveKnownRoleKeys fehlgeschlagen — Keys bleiben unverändert",
      redactError(err),
    );
    return null;
  }
}

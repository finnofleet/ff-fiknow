/**
 * Reine Scope-Filter-Logik für den Land/BU-Zielfilter (ADR 0007 §4).
 *
 * Bewusst I/O-freies Leaf-Modul (Projekt-Konvention: reine Logik von DB/
 * Payload trennen → ohne DB/Payload unit-testbar, siehe vitest.config.ts).
 * Importiert von `reconcile.ts`, getestet in `entity-scope.test.ts`.
 */

/**
 * Extrahiert die getrimmten, nicht-leeren Scope-Werte aus einem
 * Array-of-objects-Feld (analog `explicitUserTargetIds` in reconcile.ts).
 */
export function scopeValues<K extends string>(
  entries: Partial<Record<K, string | null>>[] | null | undefined,
  key: K,
): string[] {
  const values: string[] = [];
  for (const entry of entries ?? []) {
    const value = entry[key]?.trim();
    if (value) values.push(value);
  }
  return values;
}

/**
 * Reiner Scope-Filter (ADR 0007 §4): leerer Scope je Achse = kein Filter;
 * ein gesetzter Scope + `null`/fehlendes Profilfeld matcht NICHT (strikt) —
 * damit ein Land/BU-Filter nie versehentlich Personen ohne Zuordnung
 * einschließt. `landScope`/`buScope` sind bereits extrahierte, getrimmte,
 * nicht-leere Werte (siehe `scopeValues`).
 */
export function passesEntityScope(
  profile: { land: string | null; bu: string | null },
  landScope: string[],
  buScope: string[],
): boolean {
  const landOk =
    landScope.length === 0 ||
    (profile.land != null && landScope.includes(profile.land));
  const buOk =
    buScope.length === 0 || (profile.bu != null && buScope.includes(profile.bu));
  return landOk && buOk;
}

/**
 * Scope-Grant einer Rollen-Zuweisung, bereits auf getrimmte, nicht-leere
 * Werte normalisiert. Leeres Array je Achse = „keine Einschraenkung = alle"
 * (ADR 0007 §3).
 */
export type ScopeGrant = { land: string[]; bu: string[] };

/**
 * Effektiver Sicht-Scope eines Betrachters (ADR 0007 §3, Variante A).
 * `unrestricted` = sieht alles (keine scoped Zuweisung, oder ein group-level
 * Grant {alle, alle}); `scoped` = Vereinigung („ODER") ueber die Grants.
 */
export type ViewerScope =
  | { kind: "unrestricted" }
  | { kind: "scoped"; grants: ScopeGrant[] };

/**
 * Leitet den effektiven ViewerScope aus den Scope-Feldern der (bereits nach
 * Capability gefilterten) Rollen-Zuweisungen einer Person ab (ADR 0007 §3):
 *
 * - **Keine** Zuweisung -> `unrestricted`. Das ist das Gate (ADR 0007 P2b):
 *   solange niemand scoped zugewiesen ist, bleibt es beim heutigen Verhalten
 *   „sieht alles".
 * - Enthaelt irgendeine Zuweisung einen group-level Grant (beide Achsen leer
 *   = `null`/leer) -> `unrestricted` (Variante A: „alle" ist ein erstklassiger
 *   Scope-Wert, kein Sonderrollen-Typ).
 * - Sonst -> `scoped` mit der Vereinigung der Grants.
 *
 * `null` je Achse (DB: `scope_land`/`scope_bu` = NULL) bedeutet „alle" und wird
 * zu einem leeren Array normalisiert (analog `scopeValues`).
 */
export function viewerScopeFromAssignments(
  assignments: { scopeLand: string[] | null; scopeBu: string[] | null }[],
): ViewerScope {
  if (assignments.length === 0) return { kind: "unrestricted" };
  const grants: ScopeGrant[] = assignments.map((a) => ({
    land: (a.scopeLand ?? []).map((v) => v.trim()).filter(Boolean),
    bu: (a.scopeBu ?? []).map((v) => v.trim()).filter(Boolean),
  }));
  // Ein Grant ohne jede Einschraenkung (beide Achsen leer) = „alles" -> der
  // ganze Scope kollabiert zu unrestricted (die Vereinigung enthaelt „alles").
  if (grants.some((g) => g.land.length === 0 && g.bu.length === 0)) {
    return { kind: "unrestricted" };
  }
  return { kind: "scoped", grants };
}

/**
 * Prueft, ob eine Subjekt-Zeile (Land/BU-Snapshot des Nachweises) unter dem
 * Betrachter-Scope sichtbar ist: Sichtbarkeit = **ODER** ueber die Grants,
 * je Grant **UND** ueber die Dimensionen (ADR 0007 §3). Nutzt dieselbe strikte
 * `passesEntityScope`-Semantik (gesetzter Scope + `null`-Feld => kein Match),
 * damit Nachweise ohne Land/BU-Snapshot (Altbestand vor P2a) in einer scoped
 * Sicht bewusst NICHT auftauchen.
 */
export function passesViewerScope(
  subject: { land: string | null; bu: string | null },
  scope: ViewerScope,
): boolean {
  if (scope.kind === "unrestricted") return true;
  return scope.grants.some((g) => passesEntityScope(subject, g.land, g.bu));
}

/**
 * Menschenlesbare Beschreibung eines ViewerScope fuer den Rechte-Inspektor
 * (ADR 0007 §8). Rein, ohne I/O.
 */
export function describeViewerScope(scope: ViewerScope): string {
  if (scope.kind === "unrestricted") return "alle (unbeschraenkt)";
  if (scope.grants.length === 0) return "nichts (kein gueltiger Grant)";
  return scope.grants
    .map((g) => {
      const land = g.land.length ? g.land.join(", ") : "alle Laender";
      const bu = g.bu.length ? g.bu.join(", ") : "alle BUs";
      return land + " / " + bu;
    })
    .join(" oder ");
}

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

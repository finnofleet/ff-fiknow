/**
 * Typisierte Fehler der Authoring-Pipeline, die der Upload-Endpoint auf
 * spezifische HTTP-Status mappt.
 */

/**
 * Optimistic-Locking-Konflikt beim Bundle-Upload (ADR 0001, Konsequenz 1):
 * Die vom Client mitgeschickte Version weicht vom aktuellen Server-Stand ab —
 * jemand (oder eine ältere Session) hat den Kurs zwischenzeitlich überschrieben.
 * Der Endpoint antwortet darauf mit 409 statt Last-Write-Wins.
 */
export class VersionConflictError extends Error {
  readonly courseSlug: string;
  /** Version, die der Client mitschickte (sein Download-Stand). */
  readonly expected: string;
  /** Aktuelle Version auf dem Server. */
  readonly current: string;

  constructor(courseSlug: string, expected: string, current: string) {
    super(
      `Konflikt: Kurs "${courseSlug}" wurde serverseitig geändert ` +
        `(Client-Version ${expected}, Server-Version ${current}). ` +
        `Neu herunterladen, Änderungen zusammenführen, erneut hochladen.`,
    );
    this.name = "VersionConflictError";
    this.courseSlug = courseSlug;
    this.expected = expected;
    this.current = current;
  }
}

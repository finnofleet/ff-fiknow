/**
 * Cosine-Ähnlichkeit für das App-seitige Retrieval (ADR 0003, Nachtrag).
 *
 * Wir haben KEIN pgvector (Prod-Postgres bringt die Extension nicht mit) — die
 * Ähnlichkeitssuche läuft daher als Brute-Force in der App über die pro Kurs
 * geladenen `real[]`-Vektoren. Für den v1-Scope (ein Kurs, ~Hunderte Chunks à
 * 1024 Floats) ist das pro Anfrage Mikrosekunden; ein ANN-Index lohnt erst bei
 * großem, kursübergreifendem Korpus (Lernpfade → dann neu bewerten).
 *
 * Voyage liefert normalisierte Vektoren, d. h. Cosine = Skalarprodukt. Wir
 * rechnen trotzdem das volle Cosine (inkl. Normen): minimal teurer, aber robust,
 * falls je ein Provider unnormalisierte Vektoren liefert.
 */

/**
 * Cosine-Ähnlichkeit zweier gleich langer Vektoren, in [-1, 1].
 * Gibt 0 zurück, wenn ein Vektor Null-Länge hat oder die Längen nicht passen
 * (kein Throw — defensiv, damit ein einzelner kaputter Chunk das Retrieval nicht
 * abbricht).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

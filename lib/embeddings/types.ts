/**
 * Pluggable Embedding-Backend (ADR 0003) — Gegenstück zu lib/llm für den
 * RAG-Tutor.
 *
 * Der Index-Pfad (Upload-Hook, Re-Index, Backfill) und das Query-Embedding im
 * Tutor rufen NICHT einen hartverdrahteten Anbieter, sondern dieses
 * `EmbeddingProvider`-Interface. Konfiguration pro Deployment via Env-Vars
 * (siehe ./env.ts), nie brand-übergreifend geteilt — beim FiKnow-Handover legt
 * die Firma ihr eigenes Voyage-Konto an → ihr Key in deren Env.
 *
 * Die Vektor-Dimension ist KEIN Provider-Detail: alle Embeddings im Index
 * müssen dieselbe Länge haben (sonst ist Cosine nicht berechenbar). Gespeichert
 * als `lesson_chunks.embedding real[]` — siehe EMBEDDING_DIMENSIONS.
 */

/**
 * `input_type` ist bei Voyage ein Retrieval-Hinweis: dokument-seitige Chunks
 * werden mit "document" embedded, die Tutor-Frage mit "query". Das verbessert
 * die Asymmetrie Query↔Dokument messbar. Provider ohne dieses Konzept
 * ignorieren den Wert.
 */
export type EmbeddingInputType = "query" | "document";

export interface EmbeddingProvider {
  /** Aktives Modell (für Logging/Health, ohne den Key zu offenbaren). */
  readonly model: string;
  /** Ausgabe-Dimension der Vektoren (muss zum DB-Schema passen). */
  readonly dimensions: number;
  /**
   * Embeddet einen Batch Texte in Reihenfolge. Rückgabe: ein Vektor pro Input,
   * gleiche Reihenfolge/Länge wie `texts`. Leerer Input → leeres Array.
   */
  embed(
    texts: string[],
    inputType: EmbeddingInputType,
  ): Promise<number[][]>;
}

/**
 * Fehler aus dem Embedding-Pfad mit stabilem `code` — analog LlmError. Der
 * Index-Hook fängt diese und markiert den Kurs best-effort als needs-reindex,
 * statt den Upload scheitern zu lassen.
 */
export type EmbeddingErrorCode =
  | "not_configured" // kein VOYAGE_API_KEY → Indexing deploymentweit aus
  | "upstream_auth" // 401/403 vom Provider — Deployment-Fehlkonfiguration
  | "upstream_rate_limited" // 429
  | "upstream_error" // sonstiger 5xx / Netzwerkfehler
  | "timeout"
  | "bad_request" // 400 — z. B. Input über Token-Limit
  | "malformed"; // Antwort unbrauchbar (kein JSON / falsche Dimension)

export class EmbeddingError extends Error {
  readonly code: EmbeddingErrorCode;
  /** true = erneuter Versuch könnte klappen (429/5xx/Timeout). */
  readonly retryable: boolean;

  constructor(code: EmbeddingErrorCode, message: string, retryable = false) {
    super(message);
    this.name = "EmbeddingError";
    this.code = code;
    this.retryable = retryable;
  }
}

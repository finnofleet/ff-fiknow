/**
 * Embedding-Konfiguration pro Deployment (ADR 0003).
 *
 * Wie lib/llm/env.ts: alle Werte aus Env-Vars, nie hartverdrahtet. Der
 * Embedding-Index ist OPTIONAL — fehlt der Key, ist die RAG-Indexierung
 * deploymentweit AUS (der Tutor fällt dann auf den nicht-gegroundeten Pfad
 * zurück, der Upload läuft trotzdem durch → Kurse bleiben needs-reindex).
 *
 *   EMBEDDING_PROVIDER   "voyage" (Default; einziger v1-Provider)
 *   VOYAGE_API_KEY       Provider-API-Key (Pflicht, sonst Indexing AUS)
 *   EMBEDDING_MODEL      Modell-ID — Default voyage-3.5-lite (günstigster Tier,
 *                        schlägt OpenAI-v3-large; per Env auf voyage-3.5 (full)
 *                        hochstufbar OHNE Migration, da gleiche Default-Dim).
 *   EMBEDDING_BASE_URL   API-Basis-URL — Default https://api.voyageai.com.
 *
 * NICHT env-konfigurierbar: die Dimension. Alle Embeddings im Index müssen
 * dieselbe Länge haben, sonst ist Cosine-Ähnlichkeit nicht berechenbar. Das
 * DB-Schema (`lesson_chunks.embedding real[]`) erzwingt die Länge NICHT — die
 * Konsistenz liegt hier. Dimension ändern = alles neu embedden.
 */

export const EMBEDDING_DIMENSIONS = 1024;

export interface EmbeddingConfig {
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  dimensions: number;
}

const DEFAULT_PROVIDER = "voyage";
const DEFAULT_BASE_URL = "https://api.voyageai.com";
const DEFAULT_MODEL = "voyage-3.5-lite";

/**
 * Ist der RAG-Index für dieses Deployment aktiviert? (Kein Throw — für
 * Gating im Upload-Hook / Health-Checks.) Aktiv = ein API-Key ist gesetzt.
 */
export function isEmbeddingConfigured(): boolean {
  return Boolean(process.env.VOYAGE_API_KEY?.trim());
}

/**
 * Liest + validiert die Embedding-Konfiguration. Wirft, wenn nicht
 * konfiguriert — der Caller prüft vorher `isEmbeddingConfigured()`.
 */
export function getEmbeddingConfig(): EmbeddingConfig {
  const apiKey = process.env.VOYAGE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "VOYAGE_API_KEY nicht gesetzt — die RAG-Indexierung ist für dieses Deployment nicht konfiguriert.",
    );
  }

  const baseUrl = (
    process.env.EMBEDDING_BASE_URL?.trim() || DEFAULT_BASE_URL
  ).replace(/\/+$/, "");

  return {
    provider: process.env.EMBEDDING_PROVIDER?.trim() || DEFAULT_PROVIDER,
    apiKey,
    baseUrl,
    model: process.env.EMBEDDING_MODEL?.trim() || DEFAULT_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
  };
}

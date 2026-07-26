/**
 * Embedding-Konfiguration pro Deployment (ADR 0003).
 *
 * Wie lib/llm/env.ts: alle Werte aus Env-Vars, nie hartverdrahtet. Der
 * Embedding-Index ist OPTIONAL — fehlt der Key, ist die RAG-Indexierung
 * deploymentweit AUS (der Tutor fällt dann auf den nicht-gegroundeten Pfad
 * zurück, der Upload läuft trotzdem durch → Kurse bleiben needs-reindex).
 *
 *   EMBEDDING_PROVIDER   "watsonx" (Default, IBM) oder "voyage" (Legacy)
 *
 * Provider "watsonx" (Default — IBM watsonx.ai, EU-Datenresidenz via eu-de;
 * bewusste Ablösung von Voyage, weil mit IBM ein Vertrag/AVV besteht):
 *   WATSONX_API_KEY      IBM-Cloud-API-Key (Pflicht, sonst Indexing AUS)
 *   WATSONX_PROJECT_ID   watsonx.ai-Projekt-UUID (Pflicht)
 *   WATSONX_URL          Region-Endpoint, z. B. https://eu-de.ml.cloud.ibm.com
 *                        (Pflicht; trailing slash wird entfernt)
 *   WATSONX_API_VERSION  API-Versionsdatum — Default 2024-05-02
 *   EMBEDDING_MODEL      Modell-ID — Default ibm/granite-embedding-278m-multilingual
 *   → Dimension: GRANITE_DIMENSIONS (768).
 *
 * Provider "voyage" (Legacy — nur per EMBEDDING_PROVIDER=voyage):
 *   VOYAGE_API_KEY       Provider-API-Key (Pflicht, sonst Indexing AUS)
 *   EMBEDDING_MODEL      Modell-ID — Default voyage-3.5-lite.
 *   EMBEDDING_BASE_URL   API-Basis-URL — Default https://api.voyageai.com.
 *   → Dimension: VOYAGE_DIMENSIONS (1024).
 *
 * NICHT env-konfigurierbar: die Dimension. Alle Embeddings im Index müssen
 * dieselbe Länge haben, sonst ist Cosine-Ähnlichkeit nicht berechenbar. Das
 * DB-Schema (`lesson_chunks.embedding real[]`) erzwingt die Länge NICHT — die
 * Konsistenz liegt hier. Provider/Dimension wechseln = alles neu embedden
 * (siehe deploy/RUNBOOK.md, Abschnitt 5a).
 */

/** Voyage-Default-Dimension (voyage-3.5 / voyage-3.5-lite). */
export const VOYAGE_DIMENSIONS = 1024;
/** Granite-Embedding-Dimension (ibm/granite-embedding-278m-multilingual). */
export const GRANITE_DIMENSIONS = 768;

export interface EmbeddingConfig {
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  dimensions: number;
  /** Nur watsonx: das Projekt, gegen das embedded wird. */
  projectId?: string;
  /** Nur watsonx: API-Versionsdatum der Embeddings-Route. */
  apiVersion?: string;
}

// Standard ist IBM watsonx (granite) — bewusste Ablösung von Voyage: mit IBM
// (Betriebsplattform) besteht ein Vertrag/AVV, mit Voyage nicht (US/Drittland).
// Voyage bleibt als Legacy-Provider per `EMBEDDING_PROVIDER=voyage` wählbar,
// ist aber nicht mehr der Default (ADR 0003, Nachtrag 2026-07-24/-26).
const DEFAULT_PROVIDER = "watsonx";
const DEFAULT_VOYAGE_BASE_URL = "https://api.voyageai.com";
const DEFAULT_VOYAGE_MODEL = "voyage-3.5-lite";
const DEFAULT_WATSONX_MODEL = "ibm/granite-embedding-278m-multilingual";
const DEFAULT_WATSONX_API_VERSION = "2024-05-02";

function getProvider(): string {
  return process.env.EMBEDDING_PROVIDER?.trim() || DEFAULT_PROVIDER;
}

/**
 * Ist der RAG-Index für dieses Deployment aktiviert? (Kein Throw — für
 * Gating im Upload-Hook / Health-Checks.) Aktiv = die Pflicht-Env-Vars des
 * konfigurierten Providers sind gesetzt.
 */
export function isEmbeddingConfigured(): boolean {
  const provider = getProvider();
  if (provider === "watsonx") {
    return Boolean(
      process.env.WATSONX_API_KEY?.trim() &&
        process.env.WATSONX_PROJECT_ID?.trim() &&
        process.env.WATSONX_URL?.trim(),
    );
  }
  return Boolean(process.env.VOYAGE_API_KEY?.trim());
}

/**
 * Liest + validiert die Embedding-Konfiguration. Wirft, wenn nicht
 * konfiguriert — der Caller prüft vorher `isEmbeddingConfigured()`.
 */
export function getEmbeddingConfig(): EmbeddingConfig {
  const provider = getProvider();

  if (provider === "watsonx") {
    const apiKey = process.env.WATSONX_API_KEY?.trim();
    const projectId = process.env.WATSONX_PROJECT_ID?.trim();
    const url = process.env.WATSONX_URL?.trim();
    if (!apiKey || !projectId || !url) {
      throw new Error(
        "WATSONX_API_KEY / WATSONX_PROJECT_ID / WATSONX_URL nicht vollständig gesetzt — die RAG-Indexierung ist für dieses Deployment nicht konfiguriert.",
      );
    }

    return {
      provider,
      apiKey,
      // WATSONX_URL trägt den Region-Endpoint; wir spiegeln ihn in `baseUrl`,
      // damit die Factory (index.ts) provider-übergreifend gleich aussieht.
      baseUrl: url.replace(/\/+$/, ""),
      model: process.env.EMBEDDING_MODEL?.trim() || DEFAULT_WATSONX_MODEL,
      dimensions: GRANITE_DIMENSIONS,
      projectId,
      apiVersion:
        process.env.WATSONX_API_VERSION?.trim() ||
        DEFAULT_WATSONX_API_VERSION,
    };
  }

  const apiKey = process.env.VOYAGE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "VOYAGE_API_KEY nicht gesetzt — die RAG-Indexierung ist für dieses Deployment nicht konfiguriert.",
    );
  }

  const baseUrl = (
    process.env.EMBEDDING_BASE_URL?.trim() || DEFAULT_VOYAGE_BASE_URL
  ).replace(/\/+$/, "");

  return {
    provider,
    apiKey,
    baseUrl,
    model: process.env.EMBEDDING_MODEL?.trim() || DEFAULT_VOYAGE_MODEL,
    dimensions: VOYAGE_DIMENSIONS,
  };
}

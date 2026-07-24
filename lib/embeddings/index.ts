/**
 * Factory für den konfigurierten Embedding-Provider (ADR 0003) — analog
 * lib/llm/index.ts.
 *
 * Liest die Deployment-Config (./env.ts) und liefert die passende
 * `EmbeddingProvider`-Implementierung. Bekannt: "voyage" und "watsonx".
 * Weitere Provider (OpenAI als Fallback, self-hosted/lokale Embeddings für
 * restricted courses) reihen sich hier ein, ohne die Caller zu ändern.
 */
import { getEmbeddingConfig } from "./env";
import { EmbeddingError, type EmbeddingProvider } from "./types";
import { VoyageProvider } from "./voyage";
import { WatsonxProvider } from "./watsonx";

export { isEmbeddingConfigured, getEmbeddingConfig } from "./env";
export { EmbeddingError } from "./types";
export type {
  EmbeddingProvider,
  EmbeddingInputType,
  EmbeddingErrorCode,
} from "./types";

export function getEmbeddingProvider(): EmbeddingProvider {
  const cfg = getEmbeddingConfig();

  switch (cfg.provider) {
    case "voyage":
      return new VoyageProvider({
        apiKey: cfg.apiKey,
        baseUrl: cfg.baseUrl,
        model: cfg.model,
        dimensions: cfg.dimensions,
      });
    case "watsonx":
      return new WatsonxProvider({
        apiKey: cfg.apiKey,
        url: cfg.baseUrl,
        projectId: cfg.projectId!,
        model: cfg.model,
        dimensions: cfg.dimensions,
        apiVersion: cfg.apiVersion,
      });
    default:
      throw new EmbeddingError(
        "not_configured",
        `Unbekannter EMBEDDING_PROVIDER "${cfg.provider}" — unterstützt: voyage, watsonx`,
        false,
      );
  }
}

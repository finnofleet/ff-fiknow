/**
 * Factory für den konfigurierten LLM-Provider (ADR 0002).
 *
 * Liest die Deployment-Config (./env.ts) und liefert die passende
 * `CompletionProvider`-Implementierung. v1 kennt nur "anthropic"; weitere
 * Provider (Infomaniak Sovereign, self-hosted Open-Model, Bedrock/Vertex)
 * reihen sich hier ein, ohne den Tutor-Endpoint zu ändern.
 */
import { AnthropicProvider } from "./anthropic";
import { getLlmConfig } from "./env";
import { LlmError, type CompletionProvider } from "./types";

export { isTutorConfigured } from "./env";
export { LlmError } from "./types";
export type {
  CompletionProvider,
  CompletionRequest,
  CompletionResult,
  SystemBlock,
} from "./types";

export function getCompletionProvider(): CompletionProvider {
  const cfg = getLlmConfig();

  switch (cfg.provider) {
    case "anthropic":
      return new AnthropicProvider({
        apiKey: cfg.apiKey,
        baseUrl: cfg.baseUrl,
        model: cfg.model,
      });
    default:
      throw new LlmError(
        "not_configured",
        `Unbekannter LLM_PROVIDER "${cfg.provider}" — unterstützt: anthropic`,
        false,
      );
  }
}

/** Effektiver max_tokens-Cap aus der Config (für den Endpoint). */
export { getLlmConfig } from "./env";

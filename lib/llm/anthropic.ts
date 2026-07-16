/**
 * Anthropic-Provider für den Tutor (ADR 0002) — Claude Messages API über
 * rohes `fetch`, bewusst OHNE SDK-Dependency.
 *
 * Warum fetch statt @anthropic-ai/sdk: das `CompletionProvider`-Interface ist
 * schmal (ein „erklär das"-Call), und `LLM_BASE_URL` macht den Pfad
 * austauschbar (Anthropic-API direkt, Claude-Platform-on-AWS-Gateway oder ein
 * kompatibler EU-/ZDR-Proxy) — keine neue externe Abhängigkeit nötig.
 *
 * Für einen echten Bedrock-/Vertex-Pfad (SigV4 / Google-Auth) würde man hier
 * einen weiteren Provider neben diesen stellen; das Interface bleibt gleich.
 */
import {
  type CompletionProvider,
  type CompletionRequest,
  type CompletionResult,
  LlmError,
} from "./types";

const ANTHROPIC_VERSION = "2023-06-01";
const REQUEST_TIMEOUT_MS = 30_000;

interface AnthropicProviderOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
}

// Minimaler Ausschnitt der Antwort, den wir lesen.
interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
  stop_reason?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

export class AnthropicProvider implements CompletionProvider {
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(opts: AnthropicProviderOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl;
    this.model = opts.model;
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const body = {
      model: this.model,
      max_tokens: req.maxTokens,
      system: req.system.map((block) => ({
        type: "text" as const,
        text: block.text,
        ...(block.cache ? { cache_control: { type: "ephemeral" as const } } : {}),
      })),
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
    };

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "TimeoutError") {
        throw new LlmError("timeout", "LLM-Request lief in den Timeout", true);
      }
      throw new LlmError(
        "upstream_error",
        `Netzwerkfehler beim LLM-Provider: ${(err as Error).message}`,
        true,
      );
    }

    if (!res.ok) {
      // Body NICHT in einen User-Fehler durchreichen (kann Prompt-Echo /
      // Account-Details enthalten). Nur Status → stabiler code.
      throw mapHttpError(res.status);
    }

    let data: AnthropicResponse;
    try {
      data = (await res.json()) as AnthropicResponse;
    } catch {
      throw new LlmError("upstream_error", "LLM-Antwort war kein JSON", true);
    }

    // Safety-Klassifizierer kann ablehnen (HTTP 200, stop_reason "refusal").
    if (data.stop_reason === "refusal") {
      throw new LlmError(
        "refused",
        "Der LLM-Anbieter hat die Anfrage abgelehnt",
        false,
      );
    }

    const text = (data.content ?? [])
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("")
      .trim();

    if (!text) {
      throw new LlmError("empty", "LLM lieferte keinen Text", true);
    }

    return {
      text,
      stopReason: data.stop_reason,
      usage: {
        inputTokens: data.usage?.input_tokens,
        outputTokens: data.usage?.output_tokens,
        cacheReadTokens: data.usage?.cache_read_input_tokens,
      },
    };
  }
}

function mapHttpError(status: number): LlmError {
  if (status === 401 || status === 403) {
    return new LlmError(
      "upstream_auth",
      `LLM-Provider lehnte Auth ab (${status}) — Deployment-Konfiguration prüfen (LLM_API_KEY/LLM_BASE_URL)`,
      false,
    );
  }
  if (status === 429) {
    return new LlmError("upstream_rate_limited", "LLM-Provider rate-limited", true);
  }
  if (status === 529) {
    return new LlmError("upstream_overloaded", "LLM-Provider überlastet", true);
  }
  return new LlmError(
    "upstream_error",
    `LLM-Provider-Fehler (${status})`,
    status >= 500,
  );
}

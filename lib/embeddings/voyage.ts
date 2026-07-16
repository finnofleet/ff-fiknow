/**
 * Voyage-Provider für den RAG-Tutor (ADR 0003) — Voyage Embeddings API über
 * rohes `fetch`, bewusst OHNE SDK-Dependency (analog lib/llm/anthropic.ts).
 *
 * Voyage (von Anthropic empfohlen, kohärent zum Claude-Stack) gehört zu
 * MongoDB; ein eigenes Konto/Key, getrennt vom LLM_API_KEY. `EMBEDDING_BASE_URL`
 * hält den Pfad austauschbar (z. B. ein kompatibler Proxy).
 */
import {
  type EmbeddingInputType,
  type EmbeddingProvider,
  EmbeddingError,
} from "./types";

const REQUEST_TIMEOUT_MS = 30_000;
// Voyage erlaubt große Batches; wir splitten konservativ, damit auch der
// Backfill über viele Chunks nicht in Token-/Count-Limits läuft.
const MAX_BATCH = 96;

interface VoyageProviderOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  dimensions: number;
}

// Minimaler Ausschnitt der Antwort, den wir lesen.
interface VoyageResponse {
  data?: Array<{ embedding?: number[]; index?: number }>;
  usage?: { total_tokens?: number };
}

export class VoyageProvider implements EmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(opts: VoyageProviderOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl;
    this.model = opts.model;
    this.dimensions = opts.dimensions;
  }

  async embed(
    texts: string[],
    inputType: EmbeddingInputType,
  ): Promise<number[][]> {
    if (texts.length === 0) return [];

    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += MAX_BATCH) {
      const batch = texts.slice(i, i + MAX_BATCH);
      const vectors = await this.embedBatch(batch, inputType);
      out.push(...vectors);
    }
    return out;
  }

  private async embedBatch(
    batch: string[],
    inputType: EmbeddingInputType,
  ): Promise<number[][]> {
    const body = {
      input: batch,
      model: this.model,
      input_type: inputType,
      // Explizit, damit die Dimension garantiert zum DB-Schema passt — egal
      // welche 3.5-Variante (lite/full) konfiguriert ist.
      output_dimension: this.dimensions,
      // Voyage kürzt überlange Inputs statt zu fehlern (defensiv; unsere
      // Chunks sind ohnehin token-gecappt).
      truncation: true,
    };

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/v1/embeddings`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "TimeoutError") {
        throw new EmbeddingError(
          "timeout",
          "Embedding-Request lief in den Timeout",
          true,
        );
      }
      throw new EmbeddingError(
        "upstream_error",
        `Netzwerkfehler beim Embedding-Provider: ${(err as Error).message}`,
        true,
      );
    }

    if (!res.ok) {
      throw mapHttpError(res.status);
    }

    let data: VoyageResponse;
    try {
      data = (await res.json()) as VoyageResponse;
    } catch {
      throw new EmbeddingError(
        "malformed",
        "Embedding-Antwort war kein JSON",
        true,
      );
    }

    const rows = data.data;
    if (!Array.isArray(rows) || rows.length !== batch.length) {
      throw new EmbeddingError(
        "malformed",
        `Embedding-Antwort hatte ${rows?.length ?? 0} Vektoren, erwartet ${batch.length}`,
        true,
      );
    }

    // Reihenfolge über `index` absichern (Voyage liefert i.d.R. sortiert,
    // aber wir verlassen uns nicht darauf).
    const sorted = [...rows].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    return sorted.map((r, i) => {
      const v = r.embedding;
      if (!Array.isArray(v) || v.length !== this.dimensions) {
        throw new EmbeddingError(
          "malformed",
          `Vektor ${i} hatte Dimension ${v?.length ?? 0}, erwartet ${this.dimensions}`,
          false,
        );
      }
      return v;
    });
  }
}

function mapHttpError(status: number): EmbeddingError {
  if (status === 400) {
    return new EmbeddingError(
      "bad_request",
      "Embedding-Provider lehnte den Request ab (400) — evtl. Input über Token-Limit",
      false,
    );
  }
  if (status === 401 || status === 403) {
    return new EmbeddingError(
      "upstream_auth",
      `Embedding-Provider lehnte Auth ab (${status}) — VOYAGE_API_KEY prüfen`,
      false,
    );
  }
  if (status === 429) {
    return new EmbeddingError(
      "upstream_rate_limited",
      "Embedding-Provider rate-limited",
      true,
    );
  }
  return new EmbeddingError(
    "upstream_error",
    `Embedding-Provider-Fehler (${status})`,
    status >= 500,
  );
}

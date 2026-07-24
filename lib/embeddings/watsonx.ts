/**
 * Watsonx-Provider für den RAG-Tutor (ADR 0003) — IBM watsonx.ai Embeddings
 * API über rohes `fetch`, bewusst OHNE SDK-Dependency (analog voyage.ts /
 * lib/llm/anthropic.ts).
 *
 * watsonx.ai = IBM. Zwei HTTP-Aufrufe statt einem: erst ein IAM-Access-Token
 * holen (Bearer, ~60 min gültig, API-Key-Grant), dann damit die eigentliche
 * Embeddings-Route ansprechen. Das Token wird pro Prozess gecacht und nur
 * kurz vor Ablauf (Puffer 60 s) neu geholt — nicht bei jedem Batch.
 *
 * `WATSONX_URL` trägt den Region-Endpoint (z. B. `https://eu-de.ml.cloud.ibm.com`
 * für EU-Datenresidenz) — der IAM-Endpoint selbst ist global/konstant und NICHT
 * Teil davon. Modell `ibm/granite-embedding-278m-multilingual` ist symmetrisch
 * (kein query/document-Unterschied wie bei Voyage) — der `inputType`-Parameter
 * wird entgegengenommen (Signatur-Kompatibilität zum Interface), aber ignoriert.
 */
import {
  type EmbeddingInputType,
  type EmbeddingProvider,
  EmbeddingError,
} from "./types";

const REQUEST_TIMEOUT_MS = 30_000;
const IAM_URL = "https://iam.cloud.ibm.com/identity/token";
const DEFAULT_API_VERSION = "2024-05-02";
// watsonx dokumentiert kein hartes Limit, wir splitten konservativ — analog
// Voyage — damit auch der Backfill über viele Chunks nicht in Payload-/
// Timeout-Grenzen läuft.
const MAX_BATCH = 100;
// Sicherheitspuffer vor Ablauf des IAM-Tokens, damit ein knapp noch gültiges
// Token nicht mitten in einem Batch-Loop abläuft.
const TOKEN_EXPIRY_BUFFER_MS = 60_000;

interface WatsonxProviderOptions {
  apiKey: string;
  url: string;
  projectId: string;
  model: string;
  dimensions: number;
  apiVersion?: string;
}

interface IamTokenResponse {
  access_token?: string;
  expires_in?: number;
}

interface WatsonxEmbeddingsResponse {
  results?: Array<{ embedding?: number[] }>;
}

interface CachedToken {
  value: string;
  expiresAt: number;
}

export class WatsonxProvider implements EmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;
  private readonly apiKey: string;
  private readonly url: string;
  private readonly projectId: string;
  private readonly apiVersion: string;
  private token?: CachedToken;

  constructor(opts: WatsonxProviderOptions) {
    this.apiKey = opts.apiKey;
    this.url = opts.url;
    this.projectId = opts.projectId;
    this.model = opts.model;
    this.dimensions = opts.dimensions;
    this.apiVersion = opts.apiVersion || DEFAULT_API_VERSION;
  }

  async embed(
    texts: string[],
    // Granite-Embeddings sind symmetrisch — kein query/document-Unterschied
    // wie bei Voyage. Parameter bleibt für Interface-Kompatibilität stehen,
    // wird aber nicht ausgewertet.
    inputType: EmbeddingInputType,
  ): Promise<number[][]> {
    void inputType;
    if (texts.length === 0) return [];

    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += MAX_BATCH) {
      const batch = texts.slice(i, i + MAX_BATCH);
      const vectors = await this.embedBatch(batch);
      out.push(...vectors);
    }
    return out;
  }

  /**
   * Liefert ein gültiges IAM-Bearer-Token — aus dem Cache, oder frisch geholt
   * wenn keins vorhanden ist oder es (mit Puffer) bald abläuft.
   */
  private async getToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now()) {
      return this.token.value;
    }

    let res: Response;
    try {
      res = await fetch(IAM_URL, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "urn:ibm:params:oauth:grant-type:apikey",
          apikey: this.apiKey,
        }).toString(),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "TimeoutError") {
        throw new EmbeddingError(
          "timeout",
          "IAM-Token-Request lief in den Timeout",
          true,
        );
      }
      throw new EmbeddingError(
        "upstream_error",
        `Netzwerkfehler beim IAM-Token-Holen: ${(err as Error).message}`,
        true,
      );
    }

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new EmbeddingError(
          "upstream_auth",
          `IAM lehnte den API-Key ab (${res.status}) — WATSONX_API_KEY prüfen`,
          false,
        );
      }
      throw new EmbeddingError(
        "upstream_error",
        `IAM-Token-Request fehlgeschlagen (${res.status})`,
        res.status >= 500,
      );
    }

    let data: IamTokenResponse;
    try {
      data = (await res.json()) as IamTokenResponse;
    } catch {
      throw new EmbeddingError(
        "malformed",
        "IAM-Token-Antwort war kein JSON",
        true,
      );
    }

    if (!data.access_token) {
      throw new EmbeddingError(
        "malformed",
        "IAM-Token-Antwort enthielt kein access_token",
        true,
      );
    }

    const expiresInMs = (data.expires_in ?? 3600) * 1000;
    this.token = {
      value: data.access_token,
      expiresAt: Date.now() + expiresInMs - TOKEN_EXPIRY_BUFFER_MS,
    };
    return this.token.value;
  }

  private async embedBatch(batch: string[]): Promise<number[][]> {
    const token = await this.getToken();

    const body = {
      inputs: batch,
      model_id: this.model,
      project_id: this.projectId,
      parameters: { truncate_input_tokens: 512 },
    };

    let res: Response;
    try {
      res = await fetch(
        `${this.url}/ml/v1/text/embeddings?version=${this.apiVersion}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );
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

    let data: WatsonxEmbeddingsResponse;
    try {
      data = (await res.json()) as WatsonxEmbeddingsResponse;
    } catch {
      throw new EmbeddingError(
        "malformed",
        "Embedding-Antwort war kein JSON",
        true,
      );
    }

    const rows = data.results;
    if (!Array.isArray(rows) || rows.length !== batch.length) {
      throw new EmbeddingError(
        "malformed",
        `Embedding-Antwort hatte ${rows?.length ?? 0} Vektoren, erwartet ${batch.length}`,
        true,
      );
    }

    // Watsonx liefert die Reihenfolge 1:1 zur Input-Reihenfolge (kein `index`
    // wie bei Voyage), also einfach mappen.
    return rows.map((r, i) => {
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
      `Embedding-Provider lehnte Auth ab (${status}) — WATSONX_API_KEY/WATSONX_PROJECT_ID prüfen`,
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

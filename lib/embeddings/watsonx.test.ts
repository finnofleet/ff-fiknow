import { describe, it, expect, vi, beforeEach } from "vitest";

import { WatsonxProvider } from "./watsonx";

const OPTS = {
  apiKey: "test-api-key",
  url: "https://eu-de.ml.cloud.ibm.com",
  projectId: "test-project-id",
  model: "ibm/granite-embedding-278m-multilingual",
  dimensions: 3,
};

function iamResponse(overrides: Partial<{ access_token: string; expires_in: number }> = {}) {
  return new Response(
    JSON.stringify({ access_token: "token-abc", expires_in: 3600, ...overrides }),
    { status: 200 },
  );
}

function embeddingsResponse(vectors: number[][], status = 200) {
  return new Response(
    JSON.stringify({ results: vectors.map((embedding) => ({ embedding })) }),
    { status },
  );
}

describe("WatsonxProvider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("holt IAM-Token + Embeddings und liefert den Vektor in Reihenfolge", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(iamResponse())
      .mockResolvedValueOnce(embeddingsResponse([[0.1, 0.2, 0.3]]));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new WatsonxProvider(OPTS);
    const result = await provider.embed(["x"], "document");

    expect(result).toEqual([[0.1, 0.2, 0.3]]);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [iamCallUrl, iamCallInit] = fetchMock.mock.calls[0];
    expect(iamCallUrl).toBe("https://iam.cloud.ibm.com/identity/token");
    expect(iamCallInit.method).toBe("POST");
    expect(iamCallInit.headers["Content-Type"] ?? iamCallInit.headers["content-type"]).toBe(
      "application/x-www-form-urlencoded",
    );

    const [embedCallUrl, embedCallInit] = fetchMock.mock.calls[1];
    expect(embedCallUrl).toContain("/ml/v1/text/embeddings?version=2024-05-02");
    const body = JSON.parse(embedCallInit.body);
    expect(body).toMatchObject({
      inputs: ["x"],
      model_id: OPTS.model,
      project_id: OPTS.projectId,
      parameters: { truncate_input_tokens: 512 },
    });
  });

  it("cached das IAM-Token über mehrere embed()-Aufrufe hinweg", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(iamResponse())
      .mockResolvedValueOnce(embeddingsResponse([[0.1, 0.2, 0.3]]))
      .mockResolvedValueOnce(embeddingsResponse([[0.4, 0.5, 0.6]]));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new WatsonxProvider(OPTS);
    await provider.embed(["a"], "document");
    await provider.embed(["b"], "document");

    // 3 Fetches total: 1x IAM + 2x Embeddings — IAM wurde NICHT erneut geholt.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const iamCalls = fetchMock.mock.calls.filter(
      ([url]) => url === "https://iam.cloud.ibm.com/identity/token",
    );
    expect(iamCalls).toHaveLength(1);
  });

  it("wirft EmbeddingError(upstream_auth) bei 401 von der Embeddings-Route", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(iamResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new WatsonxProvider(OPTS);

    await expect(provider.embed(["x"], "document")).rejects.toMatchObject(
      expect.objectContaining({
        code: "upstream_auth",
      }),
    );
  });

  it("wirft EmbeddingError(malformed) bei Dimension-Mismatch", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(iamResponse())
      .mockResolvedValueOnce(embeddingsResponse([[0.1, 0.2]])); // nur 2 statt 3
    vi.stubGlobal("fetch", fetchMock);

    const provider = new WatsonxProvider(OPTS);

    await expect(provider.embed(["x"], "document")).rejects.toMatchObject(
      expect.objectContaining({
        code: "malformed",
      }),
    );
  });

  it("liefert [] bei leerem Input, ohne zu fetchen", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const provider = new WatsonxProvider(OPTS);
    const result = await provider.embed([], "document");

    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

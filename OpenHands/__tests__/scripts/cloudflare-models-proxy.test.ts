import { afterEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import {
  catalogModelsUrl,
  extractCatalogModelId,
  handleCloudflareModelsProxy,
  isChatCatalogModel,
  isCloudflareAccountId,
  normalizeCloudflareCatalogModels,
  workersAiSearchUrl,
} from "../../scripts/cloudflare-models-proxy.mjs";

afterEach(() => {
  vi.unstubAllGlobals();
});

const TEST_ACCOUNT_ID = "023e105f4ecef8ad9ca31a8372d0c353";

function createRequest(
  method: string,
  headers: Record<string, string>,
  body = "",
) {
  const stream = Readable.from(body ? [Buffer.from(body)] : []);
  return Object.assign(stream, {
    method,
    headers,
  });
}

function createResponse() {
  let status = 0;
  let body = "";
  const headers: Record<string, string> = {};
  return {
    response: {
      headersSent: false,
      writeHead(nextStatus: number, nextHeaders: Record<string, string>) {
        status = nextStatus;
        Object.assign(headers, nextHeaders);
        this.headersSent = true;
      },
      end(chunk = "") {
        body += chunk;
      },
    },
    read: () => ({
      status,
      headers,
      body: body ? JSON.parse(body) : null,
    }),
  };
}

describe("cloudflare models proxy", () => {
  it("builds official catalog and search URLs", () => {
    expect(catalogModelsUrl(TEST_ACCOUNT_ID, 2)).toBe(
      `https://api.cloudflare.com/client/v4/accounts/${TEST_ACCOUNT_ID}/ai/catalog/models?page=2&per_page=100`,
    );
    expect(workersAiSearchUrl(TEST_ACCOUNT_ID, 1)).toContain(
      "/ai/models/search?",
    );
    expect(isCloudflareAccountId(TEST_ACCOUNT_ID)).toBe(true);
    expect(isCloudflareAccountId("bad")).toBe(false);
  });

  it("keeps chat models and drops embeddings, images, and private rows", () => {
    const models = normalizeCloudflareCatalogModels([
      {
        model_id: "moonshotai/kimi-k3",
        name: "Kimi K3",
        task: "Text Generation",
        request_formats: ["Chat Completions"],
      },
      {
        model_id: "@cf/baai/bge-base-en-v1.5",
        name: "bge-base",
        task: "Text Embeddings",
      },
      {
        model_id: "black-forest-labs/flux-2-pro-preview",
        name: "FLUX.2 Pro",
        task: "Text-to-Image",
      },
      {
        model_id: "moonshotai/secret",
        name: "Secret",
        task: "Text Generation",
        private: true,
      },
    ]);

    expect(models).toEqual([
      {
        id: "moonshotai/kimi-k3",
        label: "Kimi K3",
        task: "Text Generation",
      },
    ]);
    expect(
      isChatCatalogModel({
        name: "@cf/meta/llama-3.1-8b-instruct",
        task: { name: "Text Generation" },
      }),
    ).toBe(true);
    expect(extractCatalogModelId({ id: "@cf/qwen/qwen3.8-27b" })).toBe(
      "@cf/qwen/qwen3.8-27b",
    );
  });

  it("loads the unified catalog through the same-origin proxy", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          result: [
            {
              model_id: "moonshotai/kimi-k3",
              name: "Kimi K3",
              task: "Text Generation",
              request_formats: ["Chat Completions"],
            },
            {
              model_id: "@cf/baai/bge-small-en-v1.5",
              name: "bge-small",
              task: "Text Embeddings",
            },
          ],
          result_info: { count: 2, page: 1, per_page: 100, total_count: 2 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = createResponse();

    await handleCloudflareModelsProxy(
      createRequest(
        "POST",
        { "content-type": "application/json" },
        JSON.stringify({
          account_id: TEST_ACCOUNT_ID,
          api_token: "cf-catalog-token",
        }),
      ),
      result.response,
      "/api/cloudflare/models",
    );

    expect(fetchMock).toHaveBeenCalledWith(
      catalogModelsUrl(TEST_ACCOUNT_ID, 1),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer cf-catalog-token",
        }),
      }),
    );
    expect(result.read()).toMatchObject({
      status: 200,
      body: {
        source: "catalog",
        modelCount: 1,
        models: [{ id: "moonshotai/kimi-k3", label: "Kimi K3" }],
      },
    });
  });

  it("falls back to Workers AI model search when the catalog is missing", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("not found", {
          status: 404,
          headers: { "Content-Type": "text/plain" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            result: [
              {
                name: "@cf/moonshotai/kimi-k2.7-code",
                task: { name: "Text Generation" },
              },
            ],
            result_info: { count: 1, page: 1, per_page: 100, total_count: 1 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const result = createResponse();

    await handleCloudflareModelsProxy(
      createRequest("GET", { authorization: "Bearer cf-search-token" }),
      result.response,
      "/api/cloudflare/models",
      { account_id: TEST_ACCOUNT_ID },
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      workersAiSearchUrl(TEST_ACCOUNT_ID, 1),
      expect.anything(),
    );
    expect(result.read().body).toMatchObject({
      source: "search",
      models: [{ id: "@cf/moonshotai/kimi-k2.7-code" }],
    });
  });
});

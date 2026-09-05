import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  formatOpencodeModelLabel,
  handleOpencodeApiProxy,
  fetchOpencodeModels,
  DEFAULT_OPENCODE_MODELS,
} from "../../scripts/opencode-api-proxy.mjs";

function createRequest(headers: Record<string, string> = {}, method = "GET") {
  return Object.assign(Readable.from([]), {
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
    read: () => ({ status, headers, body: JSON.parse(body) }),
  };
}

describe("opencode-api-proxy", () => {
  it("formats model labels properly", () => {
    expect(formatOpencodeModelLabel("big-pickle")).toBe("Big Pickle");
    expect(formatOpencodeModelLabel("deepseek-v4-pro")).toBe(
      "Deepseek V4 Pro",
    );
  });

  it("returns fallback models when no API key is provided", async () => {
    const { models, source } = await fetchOpencodeModels(null);
    expect(source).toBe("fallback-no-key");
    expect(models).toEqual(DEFAULT_OPENCODE_MODELS);
  });

  it("handles GET /api/observability/opencode/models returning fallback models when no key", async () => {
    const result = createResponse();
    await handleOpencodeApiProxy(
      createRequest(),
      result.response,
      "/api/observability/opencode/models",
    );
    const data = result.read();
    expect(data.status).toBe(200);
    expect(data.body.provider).toBe("opencode");
    expect(data.body.models.length).toBeGreaterThan(0);
    expect(data.body.models[0].id).toBe("opencode/big-pickle");
  });
});

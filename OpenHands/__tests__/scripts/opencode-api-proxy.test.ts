import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  formatOpencodeModelLabel,
  parseOpencodeModelsOutput,
  handleOpencodeApiProxy,
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
    expect(formatOpencodeModelLabel("opencode/big-pickle")).toBe(
      "Opencode Big Pickle",
    );
    expect(formatOpencodeModelLabel("anthropic/claude-sonnet-4-6")).toBe(
      "Anthropic Claude Sonnet 4 6",
    );
  });

  it("parses stdout lines into models", () => {
    const stdout = `
opencode/big-pickle
opencode/hy3-free
anthropic/claude-sonnet-4-6
openai/gpt-5.6
random text that should be ignored
`;
    const models = parseOpencodeModelsOutput(stdout);
    expect(models).toEqual([
      {
        id: "opencode/big-pickle",
        label: "Opencode Big Pickle",
        isDefault: true,
      },
      {
        id: "opencode/hy3-free",
        label: "Opencode Hy3 Free",
        isDefault: false,
      },
      {
        id: "anthropic/claude-sonnet-4-6",
        label: "Anthropic Claude Sonnet 4 6",
        isDefault: false,
      },
      {
        id: "openai/gpt-5.6",
        label: "Openai Gpt 5.6",
        isDefault: false,
      },
    ]);
  });

  it("handles GET /api/observability/opencode/models returning fallback models when CLI is absent", async () => {
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

import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
// The runtime proxy is intentionally plain ESM so ingress, static-server, and
// Vite middleware share the exact same implementation.
import {
  formatCursorModelId,
  handleCursorApiProxy,
  normalizeCursorModels,
} from "../../scripts/cursor-api-proxy.mjs";

afterEach(() => {
  vi.unstubAllGlobals();
});

function createRequest(headers: Record<string, string>) {
  return Object.assign(Readable.from([]), {
    method: "GET",
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

describe("cursor-api-proxy model normalization", () => {
  it("serializes the exact parameterized ACP model id", () => {
    expect(
      formatCursorModelId("grok-4.6", [
        { id: "effort", value: "high" },
        { id: "fast", value: true },
      ]),
    ).toBe("grok-4.6[effort=high,fast=true]");
  });

  it("keeps Cursor's default variant and its fast/normal sibling", () => {
    const models = normalizeCursorModels({
      items: [
        {
          id: "grok-4.6",
          displayName: "Grok 4.6",
          parameters: [
            {
              id: "effort",
              displayName: "Reasoning",
              values: [{ value: "high", displayName: "High" }],
            },
            { id: "fast", displayName: "Fast" },
          ],
          variants: [
            {
              displayName: "Grok 4.6",
              params: [{ id: "effort", value: "low" }],
            },
            {
              displayName: "Grok 4.6",
              isDefault: true,
              params: [
                { id: "effort", value: "high" },
                { id: "fast", value: true },
                { id: "cyber", value: false },
              ],
            },
            {
              displayName: "Grok 4.6",
              params: [
                { id: "effort", value: "high" },
                { id: "fast", value: false },
                { id: "cyber", value: false },
              ],
            },
          ],
        },
      ],
    });

    expect(models).toEqual([
      {
        id: "grok-4.6[effort=high,fast=true,cyber=false]",
        baseId: "grok-4.6",
        label: "Grok 4.6 · High · Fast",
        params: [
          { id: "effort", value: "high" },
          { id: "fast", value: "true" },
          { id: "cyber", value: "false" },
        ],
        isDefault: false,
      },
      {
        id: "grok-4.6[effort=high,fast=false,cyber=false]",
        baseId: "grok-4.6",
        label: "Grok 4.6 · High",
        params: [
          { id: "effort", value: "high" },
          { id: "fast", value: "false" },
          { id: "cyber", value: "false" },
        ],
        isDefault: false,
      },
    ]);
  });

  it("serves the normalized catalog through the authenticated proxy route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              id: "default",
              displayName: "Auto",
              variants: [{ params: [], displayName: "Auto", isDefault: true }],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = createResponse();

    await handleCursorApiProxy(
      createRequest({ "x-cursor-api-key": "proxy-test-key" }),
      result.response,
      "/api/observability/cursor/models",
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.cursor.com/v1/models",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Basic cHJveHktdGVzdC1rZXk6",
        }),
      }),
    );
    expect(result.read()).toMatchObject({
      status: 200,
      body: {
        provider: "cursor",
        modelCount: 1,
        models: [
          {
            id: "default[]",
            baseId: "default",
            label: "Auto",
            isDefault: true,
          },
        ],
      },
    });
  });
});

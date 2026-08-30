import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  axiosGet: vi.fn(),
  axiosPost: vi.fn(),
  getSecret: vi.fn(),
}));

vi.mock("axios", () => ({
  default: {
    get: mocks.axiosGet,
    post: mocks.axiosPost,
  },
}));

vi.mock("@openhands/typescript-client/clients", () => ({
  SettingsClient: vi.fn(function SettingsClientMock() {
    return { getSecret: mocks.getSecret };
  }),
}));

vi.mock("#/api/agent-server-client-options", () => ({
  getAgentServerClientOptions: () => ({}),
}));

vi.mock("#/api/agent-server-config", () => ({
  getAgentServerBaseUrl: () => "https://grok-api.example",
}));

import { CursorApiService } from "#/api/cursor-api-service";

describe("CursorApiService", () => {
  beforeEach(() => {
    mocks.axiosGet.mockReset();
    mocks.axiosPost.mockReset();
    mocks.getSecret.mockReset();
  });

  it("uses a host-configured proxy key without reading the browser secret", async () => {
    const catalog = {
      provider: "cursor",
      models: [],
      modelCount: 0,
      updatedAt: 1,
    } as const;
    mocks.axiosGet.mockResolvedValue({ status: 200, data: catalog });

    await expect(CursorApiService.getModels()).resolves.toEqual(catalog);
    expect(mocks.axiosGet).toHaveBeenCalledWith(
      "https://grok-api.example/api/observability/cursor/models",
      expect.objectContaining({ timeout: 15_000 }),
    );
    expect(mocks.getSecret).not.toHaveBeenCalled();
    expect(mocks.axiosPost).not.toHaveBeenCalled();
  });

  it("falls back to the encrypted saved CURSOR_API_KEY through the same-origin proxy", async () => {
    const usage = {
      provider: "cursor",
      scope: "cloud-agents",
      agentCount: 1,
      activeAgentCount: 1,
      runCount: 1,
      unavailableAgentCount: 0,
      truncated: false,
      totalUsage: {
        inputTokens: 10,
        outputTokens: 5,
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
        totalTokens: 15,
      },
      updatedAt: 1,
      planQuotaAvailable: false,
    } as const;
    mocks.axiosGet.mockResolvedValue({
      status: 400,
      data: { provider: "cursor", error: "Missing CURSOR_API_KEY" },
    });
    mocks.getSecret.mockResolvedValue("saved-cursor-key");
    mocks.axiosPost.mockResolvedValue({ status: 200, data: usage });

    await expect(CursorApiService.getUsage(true)).resolves.toEqual(usage);
    expect(mocks.axiosPost).toHaveBeenCalledWith(
      "https://grok-api.example/api/observability/cursor/usage?refresh=true",
      "saved-cursor-key",
      expect.objectContaining({
        headers: { "Content-Type": "text/plain" },
        timeout: 45_000,
      }),
    );
  });
});

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

import { OpencodeApiService } from "#/api/opencode-api-service";

describe("OpencodeApiService", () => {
  beforeEach(() => {
    mocks.axiosGet.mockReset();
    mocks.axiosPost.mockReset();
    mocks.getSecret.mockReset();
  });

  it("fetches models without payload when proxy has environment credentials", async () => {
    const catalog = {
      provider: "opencode",
      models: [
        { id: "opencode/big-pickle", label: "OpenCode Big Pickle", isDefault: true },
      ],
      modelCount: 1,
      updatedAt: 1,
    } as const;
    mocks.axiosGet.mockResolvedValue({ status: 200, data: catalog });

    await expect(OpencodeApiService.getModels()).resolves.toEqual(catalog);
    expect(mocks.axiosGet).toHaveBeenCalledWith(
      "https://grok-api.example/api/observability/opencode/models",
      expect.objectContaining({ timeout: 15_000 }),
    );
    expect(mocks.getSecret).not.toHaveBeenCalled();
    expect(mocks.axiosPost).not.toHaveBeenCalled();
  });

  it("falls back to saved credentials through POST when GET indicates missing credentials", async () => {
    const catalog = {
      provider: "opencode",
      models: [
        { id: "opencode/big-pickle", label: "OpenCode Big Pickle", isDefault: true },
        { id: "anthropic/claude-sonnet-4-6", label: "Anthropic Claude Sonnet 4.6" },
      ],
      modelCount: 2,
      updatedAt: 2,
    } as const;
    mocks.axiosGet.mockResolvedValue({
      status: 400,
      data: { provider: "opencode", error: "Missing OPENCODE credentials" },
    });
    mocks.getSecret.mockImplementation(async (name: string) => {
      if (name === "ANTHROPIC_API_KEY") return "sk-ant-test-key";
      return null;
    });
    mocks.axiosPost.mockResolvedValue({ status: 200, data: catalog });

    await expect(OpencodeApiService.getModels()).resolves.toEqual(catalog);
    expect(mocks.axiosPost).toHaveBeenCalledWith(
      "https://grok-api.example/api/observability/opencode/models",
      "sk-ant-test-key",
      expect.objectContaining({
        headers: { "Content-Type": "text/plain" },
        timeout: 15_000,
      }),
    );
  });
});

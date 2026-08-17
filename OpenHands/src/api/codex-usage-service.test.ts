import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";
import { CodexUsageService } from "./codex-usage-service";

vi.mock("axios");

describe("CodexUsageService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns normalized quota when proxy returns 200", async () => {
    const mockData = {
      provider: "codex",
      planType: "pro",
      primaryWindow: {
        limitSeconds: 18000,
        usedPercent: 24,
        remainingPercent: 76,
        resetAt: 1718000000,
        limitReached: false,
      },
      secondaryWindow: {
        limitSeconds: 604800,
        usedPercent: 12,
        remainingPercent: 88,
        resetAt: 1718600000,
        limitReached: false,
      },
      updatedAt: 1718000000,
    };

    vi.mocked(axios.get).mockResolvedValueOnce({
      status: 200,
      data: mockData,
    });

    const result = await CodexUsageService.getUsage();
    expect(result).toEqual(mockData);
    expect(axios.get).toHaveBeenCalledWith(
      "/api/observability/codex/usage",
      expect.objectContaining({ timeout: 12000 }),
    );
  });

  it("passes ?refresh=true when refresh flag is provided", async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      status: 200,
      data: {
        provider: "codex",
        planType: "plus",
        primaryWindow: null,
        secondaryWindow: null,
        updatedAt: 1718000000,
      },
    });

    await CodexUsageService.getUsage(true);
    expect(axios.get).toHaveBeenCalledWith(
      "/api/observability/codex/usage?refresh=true",
      expect.anything(),
    );
  });

  it("returns null when request fails or returns 404", async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      status: 404,
      data: { error: "Not found" },
    });

    const result = await CodexUsageService.getUsage();
    expect(result).toBeNull();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";
import { ClaudeUsageService } from "./claude-usage-service";

vi.mock("axios");

describe("ClaudeUsageService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns normalized quota when proxy returns 200", async () => {
    const mockData = {
      provider: "claude",
      planType: "Claude Pro",
      primaryWindow: {
        limitSeconds: 18000,
        usedPercent: 11,
        remainingPercent: 89,
        resetAt: 1718000000,
        limitReached: false,
      },
      secondaryWindow: {
        limitSeconds: 604800,
        usedPercent: 24,
        remainingPercent: 76,
        resetAt: 1718600000,
        limitReached: false,
      },
      updatedAt: 1718000000,
    };

    vi.mocked(axios.get).mockResolvedValueOnce({
      status: 200,
      data: mockData,
    });

    const result = await ClaudeUsageService.getUsage();
    expect(result).toEqual(mockData);
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining("/api/observability/claude/usage"),
      expect.objectContaining({ timeout: 12000 }),
    );
  });

  it("passes ?refresh=true when refresh flag is provided", async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      status: 200,
      data: {
        provider: "claude",
        planType: "Claude Pro",
        primaryWindow: null,
        secondaryWindow: null,
        updatedAt: 1718000000,
      },
    });

    await ClaudeUsageService.getUsage(true);
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining("/api/observability/claude/usage?refresh=true"),
      expect.anything(),
    );
  });

  it("returns null when request fails or returns 404", async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      status: 404,
      data: { error: "Not found" },
    });

    const result = await ClaudeUsageService.getUsage();
    expect(result).toBeNull();
  });
});

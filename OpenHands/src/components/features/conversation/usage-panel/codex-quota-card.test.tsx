import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { CodexQuotaCard } from "./codex-quota-card";
import { useCodexUsage } from "#/hooks/query/use-codex-usage";

vi.mock("#/hooks/query/use-codex-usage");
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("CodexQuotaCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when conversation is not Codex ACP", () => {
    vi.mocked(useCodexUsage).mockReturnValue({
      data: null,
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
    } as any);

    const { container } = render(<CodexQuotaCard />);
    expect(container.firstChild).toBeNull();
  });

  it("renders quota card with primary and secondary rate limit windows for Codex", () => {
    vi.mocked(useCodexUsage).mockReturnValue({
      data: {
        provider: "codex",
        planType: "pro",
        primaryWindow: {
          limitSeconds: 18000,
          usedPercent: 24,
          remainingPercent: 76,
          resetAt: Math.floor(Date.now() / 1000) + 7200,
          limitReached: false,
        },
        secondaryWindow: {
          limitSeconds: 604800,
          usedPercent: 10,
          remainingPercent: 90,
          resetAt: Math.floor(Date.now() / 1000) + 86400 * 3,
          limitReached: false,
        },
        updatedAt: 1718000000,
      },
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
    } as any);

    render(<CodexQuotaCard />);

    expect(screen.getByTestId("codex-quota-card")).toBeInTheDocument();
    expect(screen.getByText("ChatGPT Pro")).toBeInTheDocument();
    expect(screen.getByText("76% CONVERSATION$LEFT")).toBeInTheDocument();
    expect(screen.getByText("90% CONVERSATION$LEFT")).toBeInTheDocument();
    expect(screen.getByText("24% used")).toBeInTheDocument();
    expect(screen.getByText("10% used")).toBeInTheDocument();
  });

  it("shows rate limit warning when limit is reached", () => {
    vi.mocked(useCodexUsage).mockReturnValue({
      data: {
        provider: "codex",
        planType: "plus",
        primaryWindow: {
          limitSeconds: 18000,
          usedPercent: 100,
          remainingPercent: 0,
          resetAt: Math.floor(Date.now() / 1000) + 60,
          limitReached: true,
        },
        secondaryWindow: null,
        updatedAt: 1718000000,
      },
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
    } as any);

    render(<CodexQuotaCard />);

    expect(screen.getByText("CONVERSATION$LIMIT_REACHED")).toBeInTheDocument();
    expect(screen.getByText("0% CONVERSATION$LEFT")).toBeInTheDocument();
  });
});

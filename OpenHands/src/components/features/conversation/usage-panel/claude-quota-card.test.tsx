/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ClaudeQuotaCard } from "./claude-quota-card";
import { useClaudeUsage } from "#/hooks/query/use-claude-usage";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";

vi.mock("#/hooks/query/use-claude-usage");
vi.mock("#/hooks/query/use-active-conversation");
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("ClaudeQuotaCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useActiveConversation).mockReturnValue({
      data: {
        agent_kind: "acp",
        acp_server: "claude-code",
        llm_model: "claude-3-5-sonnet",
      },
    } as any);
  });

  it("returns null when no Claude quota data is present", () => {
    vi.mocked(useClaudeUsage).mockReturnValue({
      data: null,
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
    } as any);

    const { container } = render(<ClaudeQuotaCard />);
    expect(container.firstChild).toBeNull();
  });

  it("renders quota card with primary 5h and secondary 7d rate limit windows for Claude Code", () => {
    vi.mocked(useClaudeUsage).mockReturnValue({
      data: {
        provider: "claude",
        planType: "Claude Pro",
        primaryWindow: {
          limitSeconds: 18000,
          usedPercent: 11,
          remainingPercent: 89,
          resetAt: Math.floor(Date.now() / 1000) + 7200,
          limitReached: false,
        },
        secondaryWindow: {
          limitSeconds: 604800,
          usedPercent: 24,
          remainingPercent: 76,
          resetAt: Math.floor(Date.now() / 1000) + 86400 * 3,
          limitReached: false,
        },
        updatedAt: 1718000000,
      },
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
    } as any);

    render(<ClaudeQuotaCard />);

    expect(screen.getByTestId("claude-quota-card")).toBeInTheDocument();
    expect(screen.getByText("Claude Pro")).toBeInTheDocument();
    expect(screen.getByText("89% CONVERSATION$LEFT")).toBeInTheDocument();
    expect(screen.getByText("76% CONVERSATION$LEFT")).toBeInTheDocument();
    expect(screen.getByText("11% used")).toBeInTheDocument();
    expect(screen.getByText("24% used")).toBeInTheDocument();
  });

  it("shows rate limit warning when limit is reached", () => {
    vi.mocked(useClaudeUsage).mockReturnValue({
      data: {
        provider: "claude",
        planType: "Claude Max",
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

    render(<ClaudeQuotaCard />);

    expect(screen.getByText("CONVERSATION$LIMIT_REACHED")).toBeInTheDocument();
    expect(screen.getByText("0% CONVERSATION$LEFT")).toBeInTheDocument();
  });
});

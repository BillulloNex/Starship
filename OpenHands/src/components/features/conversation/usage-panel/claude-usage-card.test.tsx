import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ClaudeUsageCard } from "./claude-usage-card";

vi.mock("#/hooks/query/use-active-conversation", () => ({
  useActiveConversation: vi.fn(),
}));

vi.mock("#/hooks/use-live-conversation-metrics", () => ({
  useLiveConversationMetrics: vi.fn(),
}));

vi.mock("#/utils/format-token-count", () => ({
  formatCompactTokenCount: (val: number) => `${val}`,
}));

import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useLiveConversationMetrics } from "#/hooks/use-live-conversation-metrics";

describe("ClaudeUsageCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render when conversation is not Claude-powered", () => {
    vi.mocked(useActiveConversation).mockReturnValue({
      data: {
        agent_kind: "acp",
        acp_server: "codex",
        llm_model: "gpt-5",
      } as any,
    } as any);

    vi.mocked(useLiveConversationMetrics).mockReturnValue({
      usage: null,
    } as any);

    const { container } = render(<ClaudeUsageCard />);
    expect(container.firstChild).toBeNull();
  });

  it("renders when conversation is Claude ACP server", () => {
    vi.mocked(useActiveConversation).mockReturnValue({
      data: {
        agent_kind: "acp",
        acp_server: "claude-code",
        llm_model: "claude-opus-4-5",
      } as any,
    } as any);

    vi.mocked(useLiveConversationMetrics).mockReturnValue({
      usage: {
        prompt_tokens: 1500,
        completion_tokens: 500,
        cache_read_tokens: 3000,
        cache_write_tokens: 500,
        per_turn_token: 5000,
        context_window: 200000,
      },
    } as any);

    render(<ClaudeUsageCard />);

    expect(screen.getByTestId("claude-usage-card")).toBeInTheDocument();
    expect(screen.getByText("Claude Code Status")).toBeInTheDocument();
    expect(screen.getByText("Claude Subscription")).toBeInTheDocument();
    expect(screen.getByText("Prompt Cache")).toBeInTheDocument();
    expect(screen.getByText("Tokens Generated")).toBeInTheDocument();
  });

  it("renders when conversation has a Claude model string", () => {
    vi.mocked(useActiveConversation).mockReturnValue({
      data: {
        agent_kind: "openhands",
        llm_model: "anthropic/claude-3-7-sonnet",
      } as any,
    } as any);

    vi.mocked(useLiveConversationMetrics).mockReturnValue({
      usage: {
        prompt_tokens: 1000,
        completion_tokens: 200,
        cache_read_tokens: 1000,
        cache_write_tokens: 0,
        per_turn_token: 2200,
        context_window: 200000,
      },
    } as any);

    render(<ClaudeUsageCard />);

    expect(screen.getByTestId("claude-usage-card")).toBeInTheDocument();
    expect(screen.getByText("Claude Model")).toBeInTheDocument();
  });
});

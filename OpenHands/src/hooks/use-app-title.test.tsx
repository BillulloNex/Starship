import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useParams } from "react-router";
import { useUserConversation } from "./query/use-user-conversation";
import { useAppTitle } from "./use-app-title";
import { useConversationStateStore } from "#/stores/conversation-state-store";
import { ExecutionStatus } from "#/types/agent-server/core/base/common";
import {
  RUNNING_TITLE_FRAME_MS,
  RUNNING_TITLE_FRAMES,
} from "#/utils/running-title-frames";

const renderAppTitleHook = () =>
  renderHook(() => useAppTitle(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={new QueryClient()}>
        {children}
      </QueryClientProvider>
    ),
  });

vi.mock("./query/use-user-conversation");
vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return {
    ...actual,
    useParams: vi.fn(),
  };
});

const setMatchMedia = (reducedMotion: boolean) => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: reducedMotion && query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
};

describe("useAppTitle", () => {
  const mockUseUserConversation = vi.mocked(useUserConversation);
  const mockUseParams = vi.mocked(useParams);

  beforeEach(() => {
    // @ts-expect-error - only returning partial config for test
    mockUseUserConversation.mockReturnValue({ data: null });
    mockUseParams.mockReturnValue({});
    useConversationStateStore.getState().reset();
    setMatchMedia(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the OSS app title outside conversations", async () => {
    const { result } = renderAppTitleHook();

    await waitFor(() => expect(result.current).toBe("Starship"));
  });

  it("returns the conversation title with the OSS app name", async () => {
    mockUseParams.mockReturnValue({ conversationId: "123" });
    mockUseUserConversation.mockReturnValue({
      // @ts-expect-error - only returning partial config for test
      data: { title: "My Conversation" },
    });

    const { result } = renderAppTitleHook();

    await waitFor(() =>
      expect(result.current).toBe("My Conversation | Starship"),
    );
  });

  it("returns the app name while conversation data is loading", async () => {
    mockUseParams.mockReturnValue({ conversationId: "123" });
    // @ts-expect-error - only returning partial config for test
    mockUseUserConversation.mockReturnValue({ data: undefined });

    const { result } = renderAppTitleHook();

    await waitFor(() => expect(result.current).toBe("Starship"));
  });

  it.each([
    [ExecutionStatus.FINISHED, "My Conversation | Starship"],
    [ExecutionStatus.IDLE, "My Conversation | Starship"],
    [ExecutionStatus.WAITING_FOR_CONFIRMATION, "My Conversation | Starship"],
    [ExecutionStatus.PAUSED, "⚪ My Conversation | Starship"],
    [ExecutionStatus.ERROR, "🔴 My Conversation | Starship"],
    [ExecutionStatus.STUCK, "🔴 My Conversation | Starship"],
  ])(
    "formats the title correctly for execution status %s",
    async (status, expectedTitle) => {
      mockUseParams.mockReturnValue({ conversationId: "123" });
      mockUseUserConversation.mockReturnValue({
        // @ts-expect-error - only returning partial config for test
        data: { title: "My Conversation" },
      });
      useConversationStateStore.getState().setExecutionStatus(status);

      const { result } = renderAppTitleHook();

      await waitFor(() => expect(result.current).toBe(expectedTitle));
    },
  );

  it("animates a spinner in the tab title while the agent is running", () => {
    vi.useFakeTimers();
    mockUseParams.mockReturnValue({ conversationId: "123" });
    mockUseUserConversation.mockReturnValue({
      // @ts-expect-error - only returning partial config for test
      data: { title: "My Conversation" },
    });
    useConversationStateStore
      .getState()
      .setExecutionStatus(ExecutionStatus.RUNNING);

    const { result } = renderAppTitleHook();

    expect(result.current).toBe(
      `${RUNNING_TITLE_FRAMES[0]} My Conversation | Starship`,
    );

    act(() => {
      vi.advanceTimersByTime(RUNNING_TITLE_FRAME_MS);
    });
    expect(result.current).toBe(
      `${RUNNING_TITLE_FRAMES[1]} My Conversation | Starship`,
    );

    act(() => {
      vi.advanceTimersByTime(
        RUNNING_TITLE_FRAME_MS * (RUNNING_TITLE_FRAMES.length - 1),
      );
    });
    expect(result.current).toBe(
      `${RUNNING_TITLE_FRAMES[0]} My Conversation | Starship`,
    );
  });

  it("keeps a static running emoji when reduced motion is preferred", async () => {
    setMatchMedia(true);
    mockUseParams.mockReturnValue({ conversationId: "123" });
    mockUseUserConversation.mockReturnValue({
      // @ts-expect-error - only returning partial config for test
      data: { title: "My Conversation" },
    });
    useConversationStateStore
      .getState()
      .setExecutionStatus(ExecutionStatus.RUNNING);

    const { result } = renderAppTitleHook();

    await waitFor(() =>
      expect(result.current).toBe("🟢 My Conversation | Starship"),
    );
  });

  it("falls back to the conversation's execution_status when the live store is empty", async () => {
    mockUseParams.mockReturnValue({ conversationId: "123" });
    mockUseUserConversation.mockReturnValue({
      // @ts-expect-error - only returning partial config for test
      data: {
        title: "My Conversation",
        execution_status: ExecutionStatus.RUNNING,
      },
    });

    const { result } = renderAppTitleHook();

    await waitFor(() =>
      expect(result.current).toBe(
        `${RUNNING_TITLE_FRAMES[0]} My Conversation | Starship`,
      ),
    );
  });

  it("does not add an emoji when in a conversation but execution status is unknown", async () => {
    mockUseParams.mockReturnValue({ conversationId: "123" });
    mockUseUserConversation.mockReturnValue({
      // @ts-expect-error - only returning partial config for test
      data: { title: "My Conversation" },
    });

    const { result } = renderAppTitleHook();

    await waitFor(() =>
      expect(result.current).toBe("My Conversation | Starship"),
    );
  });
});

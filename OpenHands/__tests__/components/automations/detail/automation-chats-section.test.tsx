import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "test-utils";
import { AutomationChatsSection } from "#/components/features/automations/detail/automation-chats-section";
import {
  AutomationRunStatus,
  type Automation,
  type AutomationRun,
} from "#/types/automation";
import { I18nKey } from "#/i18n/declaration";
import { useAutomationRuns } from "#/hooks/query/use-automation-detail";

vi.mock("#/hooks/query/use-automation-detail", () => ({
  useAutomationRuns: vi.fn(),
}));

vi.mock("#/hooks/use-backend-scoped-path", () => ({
  useBackendScopedPath: () => (path: string) => path,
}));

const automation: Automation = {
  id: "a1",
  name: "Nightly Audit",
  trigger: { type: "cron", schedule: "0 9 * * 1-5", timezone: "UTC" },
  enabled: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  prompt: "hello",
};

const run = (
  overrides: Partial<AutomationRun> & Pick<AutomationRun, "id">,
): AutomationRun => ({
  status: AutomationRunStatus.COMPLETED,
  conversation_id: null,
  bash_command_id: null,
  error_detail: null,
  started_at: "2026-01-01T09:00:00Z",
  completed_at: "2026-01-01T09:01:00Z",
  ...overrides,
});

describe("AutomationChatsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the empty state when no runs spawned a conversation", () => {
    vi.mocked(useAutomationRuns).mockReturnValue({
      data: {
        runs: [run({ id: "r-empty", conversation_id: null })],
        total: 1,
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useAutomationRuns>);

    renderWithProviders(<AutomationChatsSection automation={automation} />);

    expect(screen.getByTestId("automation-chats")).toBeInTheDocument();
    expect(
      screen.getByText(I18nKey.AUTOMATIONS$DETAIL$NO_CHATS),
    ).toBeInTheDocument();
    expect(screen.queryByTestId(/automation-chat-/)).not.toBeInTheDocument();
  });

  it("lists unique conversations newest-first and links into the chat", () => {
    vi.mocked(useAutomationRuns).mockReturnValue({
      data: {
        runs: [
          run({ id: "latest", conversation_id: "c-shared" }),
          run({ id: "no-chat", conversation_id: null }),
          run({ id: "older-dup", conversation_id: "c-shared" }),
          run({ id: "other", conversation_id: "c-other" }),
        ],
        total: 4,
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useAutomationRuns>);

    renderWithProviders(<AutomationChatsSection automation={automation} />);

    const links = screen.getAllByRole("link", {
      name: I18nKey.AUTOMATIONS$DETAIL$OPEN_CHAT,
    });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", "/conversations/c-shared");
    expect(links[1]).toHaveAttribute("href", "/conversations/c-other");
    expect(screen.getByTestId("automation-chat-c-shared")).toBeInTheDocument();
    expect(screen.getByTestId("automation-chat-c-other")).toBeInTheDocument();
    expect(useAutomationRuns).toHaveBeenCalledWith({
      id: "a1",
      limit: 50,
      offset: 0,
    });
  });
});

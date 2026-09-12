import { describe, expect, it } from "vitest";
import { collectAutomationChats } from "#/utils/automation-chats";
import {
  AutomationRunStatus,
  type AutomationRun,
} from "#/types/automation";

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

describe("collectAutomationChats", () => {
  it("keeps unique conversation ids in newest-first run order and drops runs with no chat", () => {
    expect(
      collectAutomationChats([
        run({ id: "latest", conversation_id: "c-shared" }),
        run({ id: "no-chat", conversation_id: null }),
        run({ id: "blank", conversation_id: "   " }),
        run({ id: "older-dup", conversation_id: "c-shared" }),
        run({ id: "other", conversation_id: "c-other" }),
      ]).map((chat) => ({
        conversationId: chat.conversationId,
        runId: chat.run.id,
      })),
    ).toEqual([
      { conversationId: "c-shared", runId: "latest" },
      { conversationId: "c-other", runId: "other" },
    ]);
  });
});

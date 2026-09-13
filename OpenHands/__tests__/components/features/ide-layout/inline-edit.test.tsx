import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkbenchStore } from "#/stores/workbench-store";
import { useOptimisticUserMessageStore } from "#/stores/optimistic-user-message-store";
import { InlineEditPrompt } from "#/components/features/ide-layout/editor/inline-edit-prompt";
import { buildInlineEditPrompt } from "#/components/features/ide-layout/workbench/inline-edit";
import {
  formatCodeReference,
  getEditorReference,
} from "#/components/features/ide-layout/workbench/add-to-chat";

const send = vi.fn();

vi.mock("#/hooks/use-send-message", () => ({
  useSendMessage: () => ({ send }),
}));

vi.mock("#/hooks/use-conversation-id", () => ({
  useOptionalConversationId: () => ({ conversationId: "conv-1" }),
}));

const target = {
  path: "src/app.tsx",
  startLine: 5,
  endLine: 6,
  language: "typescript",
  code: "const a = 1;\nconst b = 2;",
};

describe("inline edit", () => {
  beforeEach(() => {
    send.mockReset().mockResolvedValue({ queued: false });
    useWorkbenchStore.setState({ inlineEdit: null, api: null });
    useOptimisticUserMessageStore.setState({ pendingMessages: [] });
  });

  it("formats code references for the agent", () => {
    expect(formatCodeReference(target)).toBe(
      "src/app.tsx:5-6\n```typescript\nconst a = 1;\nconst b = 2;\n```\n",
    );
    expect(buildInlineEditPrompt(target, "  rename b to c ")).toContain(
      "Instruction: rename b to c",
    );
  });

  it("takes the selection, or the cursor line when nothing is selected", () => {
    const lines = ["zero", "one", "two", "three"];
    const model = {
      getValueInRange: (range: {
        startLineNumber: number;
        endLineNumber: number;
      }) =>
        lines.slice(range.startLineNumber - 1, range.endLineNumber).join("\n"),
      getLineMaxColumn: () => 10,
      getLanguageId: () => "plaintext",
    };
    const editorWith = (selection: Record<string, unknown>) =>
      ({
        getModel: () => model,
        getSelection: () => selection,
      }) as never;

    expect(
      getEditorReference(
        editorWith({
          startLineNumber: 2,
          endLineNumber: 4,
          endColumn: 1,
          isEmpty: () => false,
        }),
        "notes.txt",
      ),
    ).toMatchObject({ startLine: 2, endLine: 3, code: "one\ntwo" });

    expect(
      getEditorReference(
        editorWith({
          startLineNumber: 3,
          endLineNumber: 3,
          endColumn: 2,
          isEmpty: () => true,
        }),
        "notes.txt",
      ),
    ).toMatchObject({ startLine: 3, endLine: 3, code: "two" });
  });

  it("sends the instruction to the agent and closes", async () => {
    const user = userEvent.setup();
    useWorkbenchStore.setState({ inlineEdit: target });
    render(<InlineEditPrompt />);

    await user.type(
      screen.getByTestId("inline-edit-input"),
      "rename b to c{Enter}",
    );
    expect(send).toHaveBeenCalledWith({
      action: "message",
      args: {
        content: buildInlineEditPrompt(target, "rename b to c"),
        timestamp: expect.any(String),
      },
    });
    expect(
      useOptimisticUserMessageStore.getState().pendingMessages,
    ).toHaveLength(1);
    expect(useWorkbenchStore.getState().inlineEdit).toBeNull();
  });

  it("does nothing for an empty instruction and closes on Escape", async () => {
    const user = userEvent.setup();
    useWorkbenchStore.setState({ inlineEdit: target });
    render(<InlineEditPrompt />);

    await user.type(screen.getByTestId("inline-edit-input"), "{Enter}");
    expect(send).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(useWorkbenchStore.getState().inlineEdit).toBeNull();
  });
});

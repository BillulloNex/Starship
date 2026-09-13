/* eslint-disable i18next/no-literal-string */
import React, { useEffect, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { useOptionalConversationId } from "#/hooks/use-conversation-id";
import { useSendMessage } from "#/hooks/use-send-message";
import { useOptimisticUserMessageStore } from "#/stores/optimistic-user-message-store";
import { useWorkbenchStore } from "#/stores/workbench-store";
import { addWorkbenchPanel } from "../workbench/panels";
import { buildInlineEditPrompt } from "../workbench/inline-edit";

/**
 * ⌘K: describe a change to the selected code and hand it to the agent. The
 * result arrives as an ordinary edit, ready to review.
 */
export function InlineEditPrompt() {
  const target = useWorkbenchStore((s) => s.inlineEdit);
  const { conversationId } = useOptionalConversationId();
  const { send } = useSendMessage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [instruction, setInstruction] = useState("");

  useEffect(() => {
    if (target) {
      setInstruction("");
      inputRef.current?.focus();
    }
  }, [target]);

  if (!target) return null;

  const close = () => {
    useWorkbenchStore.getState().setInlineEdit(null);
    requestAnimationFrame(() => useWorkbenchStore.getState().editor?.focus());
  };

  const submit = () => {
    if (!instruction.trim()) return;
    const content = buildInlineEditPrompt(target, instruction);
    const { enqueuePendingMessage, markPendingMessageError } =
      useOptimisticUserMessageStore.getState();
    const pendingId = conversationId
      ? enqueuePendingMessage({ conversationId, text: content })
      : null;
    send({
      action: "message",
      args: { content, timestamp: new Date().toISOString() },
    }).catch((error: unknown) => {
      if (pendingId) {
        markPendingMessageError(
          pendingId,
          error instanceof Error ? error.message : undefined,
        );
      }
    });
    const { api } = useWorkbenchStore.getState();
    if (api) addWorkbenchPanel(api, "chat");
    close();
  };

  const lines =
    target.startLine === target.endLine
      ? `line ${target.startLine}`
      : `lines ${target.startLine}–${target.endLine}`;

  return (
    <div
      className="flex shrink-0 items-center gap-2 border-b border-[#528bff]/40 bg-[#101a2e] px-3 py-1.5"
      data-testid="inline-edit-prompt"
    >
      <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#7aa2ff]" />
      <span className="shrink-0 text-[11px] text-[var(--oh-muted)]">
        {target.path.split("/").pop()} · {lines}
      </span>
      <input
        ref={inputRef}
        value={instruction}
        onChange={(event) => setInstruction(event.target.value)}
        onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
          if (event.key === "Enter") {
            event.preventDefault();
            submit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            close();
          }
        }}
        placeholder="Describe the change for the agent, then press Enter"
        aria-label="Describe the change for the agent"
        data-testid="inline-edit-input"
        className="min-w-0 flex-1 bg-transparent text-xs text-white placeholder-[var(--oh-muted)] focus:outline-none"
      />
      <button
        type="button"
        aria-label="Cancel"
        onClick={close}
        className="rounded p-0.5 text-[var(--oh-muted)] hover:bg-white/10 hover:text-white"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

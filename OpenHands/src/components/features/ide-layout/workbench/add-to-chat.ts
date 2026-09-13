import type { editor } from "monaco-editor";
import { useConversationStore } from "#/stores/conversation-store";
import { useWorkbenchStore } from "#/stores/workbench-store";
import { addWorkbenchPanel } from "./panels";

const CHAT_INPUT_SELECTOR = '[data-testid="chat-input"]';

export interface CodeReference {
  path: string;
  startLine: number;
  endLine: number;
  language: string;
  code: string;
}

/**
 * The selection (or the cursor's line when nothing is selected) in the
 * active editor, as a reference the agent can act on.
 */
export function getEditorReference(
  instance: editor.ICodeEditor | null,
  path: string | null,
): CodeReference | null {
  const model = instance?.getModel();
  const selection = instance?.getSelection();
  if (!instance || !model || !selection || !path) return null;

  const { startLineNumber } = selection;
  let { endLineNumber } = selection;
  // A selection that ends at column 1 doesn't really include that line.
  if (endLineNumber > startLineNumber && selection.endColumn === 1) {
    endLineNumber -= 1;
  }
  if (selection.isEmpty()) endLineNumber = startLineNumber;

  const code = model.getValueInRange({
    startLineNumber,
    startColumn: 1,
    endLineNumber,
    endColumn: model.getLineMaxColumn(endLineNumber),
  });

  return {
    path,
    startLine: startLineNumber,
    endLine: endLineNumber,
    language: model.getLanguageId(),
    code,
  };
}

export function formatCodeReference(reference: CodeReference): string {
  const lines =
    reference.startLine === reference.endLine
      ? `${reference.startLine}`
      : `${reference.startLine}-${reference.endLine}`;
  const fence = reference.code.includes("```") ? "````" : "```";
  const language = reference.language === "plaintext" ? "" : reference.language;
  return `${reference.path}:${lines}\n${fence}${language}\n${reference.code}\n${fence}\n`;
}

function focusChatInputAtEnd() {
  const input = document.querySelector<HTMLElement>(CHAT_INPUT_SELECTOR);
  if (!input) return;
  input.focus();
  const range = document.createRange();
  range.selectNodeContents(input);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/** Appends a code reference to the chat draft and focuses the chat. */
export function addReferenceToChat(reference: CodeReference) {
  const { api } = useWorkbenchStore.getState();
  if (api) addWorkbenchPanel(api, "chat");

  const current =
    document.querySelector<HTMLElement>(CHAT_INPUT_SELECTOR)?.innerText ?? "";
  const snippet = formatCodeReference(reference);
  const draft = current.trim() ? `${current.trimEnd()}\n\n${snippet}` : snippet;
  useConversationStore.getState().setMessageToSend(draft);

  // Let the composer apply the draft (and mount, if chat was just opened).
  requestAnimationFrame(() => requestAnimationFrame(focusChatInputAtEnd));
}

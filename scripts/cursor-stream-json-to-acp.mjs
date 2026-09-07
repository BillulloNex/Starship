/**
 * Map Cursor CLI `--output-format stream-json` events to ACP session/update
 * payloads. Print mode suppresses thinking; the thinking branch is kept so a
 * future CLI that emits it still reaches the canvas.
 *
 * Assistant duplicate-flush rule (Cursor docs, with --stream-partial-output):
 *   timestamp_ms present, model_call_id absent → new text
 *   both present → skip (buffered flush before a tool call)
 *   both absent after partials → skip (final flush)
 *   both absent with no prior partials → legacy complete-message event
 */

export const MAX_ACP_RAW_OUTPUT_CHARS = 8000;

const TOOL_KIND_BY_KEY = {
  readToolCall: "read",
  lsToolCall: "read",
  globToolCall: "read",
  grepToolCall: "read",
  writeToolCall: "edit",
  editToolCall: "edit",
  applyPatchToolCall: "edit",
  shellToolCall: "execute",
  bashToolCall: "execute",
  terminalToolCall: "execute",
  fetchToolCall: "fetch",
  webFetchToolCall: "fetch",
  webSearchToolCall: "fetch",
};

export function createCursorStreamJsonState() {
  return {
    seenPartialAssistant: false,
    emittedAssistant: false,
    sawSuccessResult: false,
    isError: false,
    errorMessage: null,
    resultText: "",
  };
}

export function cursorPrintAgentArgs(model) {
  const args = [
    "-p",
    "--trust",
    "-f",
    "--output-format",
    "stream-json",
    "--stream-partial-output",
  ];
  if (model) args.push("--model", model);
  return args;
}

export function truncateAcpPayload(value, maxChars = MAX_ACP_RAW_OUTPUT_CHARS) {
  if (value == null) return value;
  if (typeof value === "string") {
    return value.length <= maxChars ? value : `${value.slice(0, maxChars)}…`;
  }
  let text;
  try {
    text = JSON.stringify(value);
  } catch {
    text = String(value);
  }
  if (text.length <= maxChars) return value;
  return `${text.slice(0, maxChars)}…`;
}

function contentBlocksText(content) {
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => block && block.type === "text" && block.text)
    .map((block) => block.text)
    .join("");
}

function shouldEmitAssistantText(event, state) {
  const hasTs = event.timestamp_ms != null;
  const hasModelCall = event.model_call_id != null;
  if (hasTs && !hasModelCall) {
    state.seenPartialAssistant = true;
    return true;
  }
  if (hasTs && hasModelCall) return false;
  if (state.seenPartialAssistant) return false;
  return true;
}

function firstToolEntry(toolCall) {
  if (!toolCall || typeof toolCall !== "object" || Array.isArray(toolCall)) {
    return null;
  }
  if (toolCall.function && typeof toolCall.function === "object") {
    return { key: "function", payload: toolCall.function };
  }
  const key = Object.keys(toolCall)[0];
  if (!key) return null;
  return { key, payload: toolCall[key] };
}

function toolKindForKey(key) {
  return TOOL_KIND_BY_KEY[key] || "other";
}

function toolTitle(key, payload) {
  const args = payload?.args && typeof payload.args === "object" ? payload.args : {};
  if (typeof args.path === "string" && args.path) return args.path;
  if (typeof args.command === "string" && args.command) return args.command;
  if (typeof args.query === "string" && args.query) return args.query;
  if (typeof args.url === "string" && args.url) return args.url;
  if (key === "function") {
    return payload?.name ? String(payload.name) : "function";
  }
  return key.replace(/ToolCall$/, "") || "tool";
}

function toolRawInput(key, payload) {
  if (key === "function") {
    return {
      name: payload?.name,
      arguments: payload?.arguments,
    };
  }
  return payload?.args ?? payload ?? {};
}

function toolCompletionStatus(payload, event) {
  if (event?.is_error === true) return "failed";
  const result = payload?.result;
  if (result && typeof result === "object") {
    if (result.error || result.failure) return "failed";
    if (result.success) return "completed";
  }
  if (event?.subtype === "failed") return "failed";
  return "completed";
}

function toolRawOutput(payload) {
  const result = payload?.result;
  if (result == null) return undefined;
  if (typeof result === "object") {
    if (result.success !== undefined) return truncateAcpPayload(result.success);
    if (result.error !== undefined) return truncateAcpPayload(result.error);
    if (result.failure !== undefined) return truncateAcpPayload(result.failure);
  }
  return truncateAcpPayload(result);
}

function thinkingText(event) {
  if (typeof event.text === "string" && event.text) return event.text;
  if (typeof event.thinking === "string" && event.thinking) return event.thinking;
  return contentBlocksText(event.message?.content || event.content);
}

/**
 * @returns {{ updates: object[] }}
 */
export function mapCursorStreamJsonEvent(event, state) {
  const updates = [];
  if (!event || typeof event !== "object") return { updates };

  const type = event.type;
  if (type === "system" || type === "user") return { updates };

  if (type === "thinking") {
    const text = thinkingText(event);
    if (text) {
      updates.push({
        sessionUpdate: "agent_thought_chunk",
        content: { type: "text", text },
      });
    }
    return { updates };
  }

  if (type === "assistant") {
    if (!shouldEmitAssistantText(event, state)) return { updates };
    const text = contentBlocksText(event.message?.content);
    if (text) {
      state.emittedAssistant = true;
      updates.push({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text },
      });
    }
    return { updates };
  }

  if (type === "tool_call") {
    const callId = event.call_id || event.toolCallId;
    if (!callId) return { updates };
    const entry = firstToolEntry(event.tool_call);
    if (!entry) return { updates };
    const kind = toolKindForKey(entry.key);
    const title = toolTitle(entry.key, entry.payload);
    const subtype = event.subtype || "started";

    if (subtype === "started" || subtype === "start") {
      updates.push({
        sessionUpdate: "tool_call",
        toolCallId: String(callId),
        title,
        kind,
        status: "in_progress",
        rawInput: toolRawInput(entry.key, entry.payload),
      });
      return { updates };
    }

    updates.push({
      sessionUpdate: "tool_call_update",
      toolCallId: String(callId),
      status: toolCompletionStatus(entry.payload, event),
      rawOutput: toolRawOutput(entry.payload),
    });
    return { updates };
  }

  if (type === "result") {
    const text = typeof event.result === "string" ? event.result : "";
    state.resultText = text;
    if (event.is_error === true || event.subtype === "error") {
      state.isError = true;
      state.errorMessage = text || "Unknown error from agent -p";
    } else {
      state.sawSuccessResult = true;
    }
    return { updates };
  }

  return { updates };
}

export function mapCursorStreamJsonLine(line, state) {
  const trimmed = String(line || "").trim();
  if (!trimmed) return { updates: [] };
  try {
    return mapCursorStreamJsonEvent(JSON.parse(trimmed), state);
  } catch {
    return { updates: [] };
  }
}

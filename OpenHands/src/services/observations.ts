import { ObservationMessage } from "#/types/message";
import { useCommandStore } from "#/stores/command-store";
import ObservationType from "#/types/observation-type";
import { useBrowserStore } from "#/stores/browser-store";
import { useAgentStore } from "#/stores/agent-store";
import { AgentState } from "#/types/agent-state";
import useMetricsStore from "#/stores/metrics-store";
import { activeMcpToolCalls } from "./actions";
import { recordMcpToolCall } from "./langfuse-service";

export function handleObservationMessage(message: ObservationMessage) {
  if (
    message.observation === ObservationType.MCP ||
    message.observation === "mcp"
  ) {
    const pendingCall =
      activeMcpToolCalls.get(message.cause) ||
      activeMcpToolCalls.get(message.id);
    const durationMs = pendingCall
      ? Date.now() - pendingCall.startTime
      : 150;

    const toolName = pendingCall?.toolName || "mcp_tool";
    const serverName = pendingCall?.serverName || "mcp-server";
    const success = !message.extras?.error_id;

    useMetricsStore
      .getState()
      .recordMcpToolExecution(toolName, serverName, durationMs, success);

    recordMcpToolCall({
      conversationId: String(message.id ?? "active-conversation"),
      toolName,
      serverName,
      input: pendingCall?.input,
      output: message.content,
      durationMs,
      status: success ? "SUCCESS" : "ERROR",
      errorMessage: message.extras?.error_id
        ? String(message.extras.error_id)
        : undefined,
    });

    if (message.cause) activeMcpToolCalls.delete(message.cause);
    if (message.id) activeMcpToolCalls.delete(message.id);
  }

  switch (message.observation) {
    case ObservationType.RUN: {
      if (message.extras?.hidden) break;
      let { content } = message;

      if (content.length > 5000) {
        const halfLength = 2500;
        const head = content.slice(0, halfLength);
        const tail = content.slice(content.length - halfLength);
        content = `${head}\r\n\n... (truncated ${message.content.length - 5000} characters) ...\r\n\n${tail}`;
      }

      useCommandStore.getState().appendOutput(content);
      break;
    }
    case ObservationType.BROWSE:
    case ObservationType.BROWSE_INTERACTIVE:
      if (
        message.extras?.screenshot &&
        typeof message.extras.screenshot === "string"
      ) {
        useBrowserStore.getState().setScreenshotSrc(message.extras.screenshot);
      }
      if (message.extras?.url && typeof message.extras.url === "string") {
        useBrowserStore.getState().setUrl(message.extras.url);
      }
      break;
    case ObservationType.AGENT_STATE_CHANGED:
      if (typeof message.extras.agent_state === "string") {
        useAgentStore
          .getState()
          .setCurrentAgentState(message.extras.agent_state as AgentState);
      }
      break;
    case ObservationType.DELEGATE:
    case ObservationType.READ:
    case ObservationType.EDIT:
    case ObservationType.THINK:
    case ObservationType.NULL:
    case ObservationType.RECALL:
    case ObservationType.ERROR:
    case ObservationType.MCP:
    case ObservationType.TASK_TRACKING:
      break;
    default:
      break;
  }
  if (!message.extras?.hidden) {
    const { observation } = message;

    switch (observation) {
      case "browse":
        if (
          message.extras?.screenshot &&
          typeof message.extras.screenshot === "string"
        ) {
          useBrowserStore
            .getState()
            .setScreenshotSrc(message.extras.screenshot);
        }
        if (message.extras?.url && typeof message.extras.url === "string") {
          useBrowserStore.getState().setUrl(message.extras.url);
        }
        break;
      case "browse_interactive":
        if (
          message.extras?.screenshot &&
          typeof message.extras.screenshot === "string"
        ) {
          useBrowserStore
            .getState()
            .setScreenshotSrc(message.extras.screenshot);
        }
        if (message.extras?.url && typeof message.extras.url === "string") {
          useBrowserStore.getState().setUrl(message.extras.url);
        }
        break;
      default:
        break;
    }
  }
}

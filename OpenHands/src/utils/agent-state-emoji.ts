import { ExecutionStatus } from "#/types/agent-server/core/base/common";

/**
 * Maps a conversation's execution status to a single emoji that visually
 * conveys active or error agent states in the browser tab title.
 *
 *   🟢 green circle — agent is running (static fallback; the tab title
 *      uses a braille spinner unless the user prefers reduced motion)
 *   ⚪ gray circle — agent is paused/stopped
 *   🔴 red circle — agent is in an error state
 *
 * Returns null when idle, finished, or waiting so tab titles remain clean.
 */
export function getAgentStateEmoji(
  status: ExecutionStatus | null | undefined,
): string | null {
  switch (status) {
    case ExecutionStatus.RUNNING:
      return "🟢";
    case ExecutionStatus.PAUSED:
      return "⚪";
    case ExecutionStatus.ERROR:
    case ExecutionStatus.STUCK:
      return "🔴";
    case ExecutionStatus.FINISHED:
    case ExecutionStatus.IDLE:
    case ExecutionStatus.WAITING_FOR_CONFIRMATION:
    default:
      return null;
  }
}

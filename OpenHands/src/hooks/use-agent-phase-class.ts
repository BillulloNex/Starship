import { useMemo, useRef, useEffect, useState } from "react";
import { useAgentState } from "#/hooks/use-agent-state";
import { AgentState } from "#/types/agent-state";
import type { OHEvent } from "#/stores/use-event-store";
import { isActionEvent, isStreamingDeltaEvent } from "#/types/agent-server/type-guards";

/**
 * CSS class names that correspond to each agent activity phase.
 * These map to the selectors defined in styles/agent-phase-glow.css.
 */
export type AgentPhase =
  | "agent-phase-waiting"
  | "agent-phase-thinking"
  | "agent-phase-running"
  | "agent-phase-finished"
  | "agent-phase-error"
  | null;

/** How long the "finished" glow stays visible before being removed. */
const FINISHED_LINGER_MS = 2_500;

/**
 * Inspects the most recent unresolved event to decide whether the agent
 * is thinking (ThinkAction, reasoning/streaming delta) or executing a
 * tool call (any other action kind).
 */
function isThinkingEvent(events: readonly OHEvent[]): boolean {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];

    // Streaming deltas with reasoning_content indicate thinking
    if (isStreamingDeltaEvent(event) && event.reasoning_content) {
      return true;
    }

    if (isActionEvent(event)) {
      return event.action.kind === "ThinkAction";
    }
  }
  return true; // default to thinking if no events yet
}

/**
 * Maps the current agent state + latest events to a CSS phase class name.
 *
 * Returns `null` when no glow should be shown (idle / awaiting user input).
 */
export function useAgentPhaseClass(
  events: readonly OHEvent[],
): AgentPhase {
  const { curAgentState } = useAgentState();

  // Track the "finished" linger so the green glow fades out gracefully
  // instead of snapping away the instant the agent reaches FINISHED.
  const [lingeringFinished, setLingeringFinished] = useState(false);
  const finishedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When agent transitions to FINISHED/STOPPED, start the linger timer.
  useEffect(() => {
    if (
      curAgentState === AgentState.FINISHED ||
      curAgentState === AgentState.STOPPED
    ) {
      setLingeringFinished(true);
      finishedTimerRef.current = setTimeout(() => {
        setLingeringFinished(false);
      }, FINISHED_LINGER_MS);
    } else {
      // Agent moved to a new state — cancel any pending fade-out
      setLingeringFinished(false);
      if (finishedTimerRef.current) {
        clearTimeout(finishedTimerRef.current);
        finishedTimerRef.current = null;
      }
    }

    return () => {
      if (finishedTimerRef.current) {
        clearTimeout(finishedTimerRef.current);
      }
    };
  }, [curAgentState]);

  return useMemo<AgentPhase>(() => {
    switch (curAgentState) {
      case AgentState.LOADING:
      case AgentState.INIT:
        return "agent-phase-waiting";

      case AgentState.RUNNING:
        return isThinkingEvent(events)
          ? "agent-phase-thinking"
          : "agent-phase-running";

      case AgentState.FINISHED:
      case AgentState.STOPPED:
        return lingeringFinished ? "agent-phase-finished" : null;

      case AgentState.ERROR:
      case AgentState.RATE_LIMITED:
        return "agent-phase-error";

      // Awaiting input, paused, confirmation, rejected — no glow
      default:
        return null;
    }
  }, [curAgentState, events, lingeringFinished]);
}

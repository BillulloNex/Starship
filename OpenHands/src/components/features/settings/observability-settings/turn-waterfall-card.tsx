import React, { useState, useMemo } from "react";
import { cn } from "#/utils/utils";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useEventStore, type OHEvent } from "#/stores/use-event-store";
import {
  isActionEvent,
  isObservationEvent,
  isMessageEvent,
  isUserMessageEvent,
} from "#/types/agent-server/type-guards";

export interface TurnStep {
  id: string;
  type: "prompt" | "runtime" | "llm" | "tool" | "response";
  title: string;
  subtitle?: string;
  offsetMs: number;
  durationMs: number;
  status: "success" | "running" | "error";
  details?: {
    model?: string;
    promptTokens?: number;
    completionTokens?: number;
    cost?: number;
    command?: string;
    toolName?: string;
    serverName?: string;
    exitCode?: number;
    output?: string;
    message?: string;
  };
}

export interface TurnData {
  turnIndex: number;
  timestamp: string;
  totalDurationMs: number;
  totalTokens: number;
  totalCost: number;
  steps: TurnStep[];
}

export interface TurnWaterfallCardProps {
  site?: string;
  conversationId?: string;
  events?: OHEvent[];
}

function buildTurnsFromEvents(events: OHEvent[]): TurnData[] {
  if (events.length === 0) return [];

  const turnGroups: OHEvent[][] = [];
  let currentGroup: OHEvent[] = [];

  for (const event of events) {
    if (isUserMessageEvent(event) && currentGroup.length > 0) {
      turnGroups.push(currentGroup);
      currentGroup = [event];
    } else {
      currentGroup.push(event);
    }
  }
  if (currentGroup.length > 0) {
    turnGroups.push(currentGroup);
  }

  const recentGroups = turnGroups.slice(-5);

  return recentGroups.map((group, groupIdx) => {
    const turnIndex = turnGroups.length - recentGroups.length + groupIdx + 1;
    const firstTimestamp = "timestamp" in group[0] ? group[0].timestamp : "";
    const lastEvent = group[group.length - 1];
    const lastTimestamp = "timestamp" in lastEvent ? lastEvent.timestamp : "";

    const startMs = firstTimestamp ? new Date(firstTimestamp).getTime() : 0;
    const endMs = lastTimestamp ? new Date(lastTimestamp).getTime() : startMs;
    const totalDurationMs = Math.max(0, endMs - startMs);

    const steps: TurnStep[] = [];
    let stepIndex = 0;

    for (const event of group) {
      const eventTimestamp = "timestamp" in event ? event.timestamp : undefined;
      const eventTime = eventTimestamp
        ? new Date(eventTimestamp).getTime()
        : startMs;
      const offsetMs = Math.max(0, eventTime - startMs);

      if (isUserMessageEvent(event)) {
        steps.push({
          id: `step-${turnIndex}-${stepIndex++}`,
          type: "prompt",
          title: "User Prompt",
          subtitle: truncateText(extractMessageText(event), 90),
          offsetMs,
          durationMs: 0,
          status: "success",
          details: {
            message: extractMessageText(event),
          },
        });
      } else if (isActionEvent(event)) {
        const toolName = event.tool_name || event.action?.kind || "tool";
        const thought =
          event.thought?.map((t) => ("text" in t ? t.text : "")).join("") || "";
        const matchingObs = events.find(
          (e) =>
            isObservationEvent(e) &&
            "action_id" in e &&
            e.action_id === event.id,
        );
        const matchingObsTimestamp =
          matchingObs && "timestamp" in matchingObs
            ? matchingObs.timestamp
            : undefined;
        const obTime = matchingObsTimestamp
          ? new Date(matchingObsTimestamp).getTime()
          : eventTime + 200;
        const durationMs = Math.max(0, obTime - eventTime);

        steps.push({
          id: `step-${turnIndex}-${stepIndex++}`,
          type: "tool",
          title: `Tool: ${toolName}`,
          subtitle: event.summary || truncateText(thought, 90) || undefined,
          offsetMs,
          durationMs,
          status: "success",
          details: {
            toolName,
            message: thought || undefined,
          },
        });
      } else if (
        isMessageEvent(event) &&
        event.llm_message?.role === "assistant"
      ) {
        steps.push({
          id: `step-${turnIndex}-${stepIndex++}`,
          type: "response",
          title: "Agent Response",
          subtitle: truncateText(extractMessageText(event), 90),
          offsetMs,
          durationMs: 0,
          status: "success",
          details: {
            message: truncateText(extractMessageText(event), 300),
          },
        });
      }
    }

    return {
      turnIndex,
      timestamp: firstTimestamp
        ? new Date(firstTimestamp).toLocaleTimeString()
        : `Turn ${turnIndex}`,
      totalDurationMs,
      totalTokens: 0,
      totalCost: 0,
      steps,
    };
  });
}

function extractMessageText(event: OHEvent): string {
  if (isMessageEvent(event) && event.llm_message?.content) {
    return event.llm_message.content
      .map((c) => ("text" in c ? c.text : ""))
      .join("")
      .trim();
  }
  return "";
}

function truncateText(text: string, maxLen: number): string {
  if (!text) return "";
  return text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
}

export function TurnWaterfallCard({
  site = "us5.datadoghq.com",
  conversationId: propConversationId,
  events: propEvents,
}: TurnWaterfallCardProps) {
  const { data: conversation } = useActiveConversation();
  const conversationId = propConversationId || conversation?.id;
  const storeEvents = useEventStore((state) => state.events);
  const events = propEvents !== undefined ? propEvents : storeEvents;

  const [expandedStepIds, setExpandedStepIds] = useState<Set<string>>(new Set());
  const [selectedTurnIndex, setSelectedTurnIndex] = useState<number>(-1);

  const turns: TurnData[] = useMemo(
    () => buildTurnsFromEvents(events),
    [events],
  );

  const effectiveTurnIdx =
    selectedTurnIndex >= 0 && selectedTurnIndex < turns.length
      ? selectedTurnIndex
      : turns.length - 1;
  const currentTurn = turns[effectiveTurnIdx];

  const toggleStep = (id: string) => {
    setExpandedStepIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (!currentTurn) {
    return (
      <div className="rounded-lg border border-[var(--oh-border)] bg-surface-raised p-4">
        <h3 className="text-sm font-semibold text-foreground pb-2 border-b border-[var(--oh-border)] mb-3">
          Turn Execution Lifecycle Waterfall
        </h3>
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <p className="text-xs text-[var(--oh-muted)]">No turns recorded yet</p>
          <p className="text-[11px] text-[var(--oh-muted)] mt-1 font-mono">
            Send a message to see execution timeline
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--oh-border)] bg-surface-raised p-4">
      {/* Header & Turn Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--oh-border)] mb-3">
        <div className="space-y-0.5">
          <h3 className="text-sm font-semibold text-foreground">
            Turn Execution Lifecycle Waterfall
          </h3>
          <p className="text-xs text-[var(--oh-muted)]">
            Turn #{currentTurn.turnIndex} ({currentTurn.timestamp})
          </p>
        </div>

        {/* Turn Selector Pills */}
        {turns.length > 1 && (
          <div className="inline-flex items-center p-0.5 rounded-md bg-surface border border-[var(--oh-border)] text-xs font-mono">
            {turns.map((t, idx) => (
              <button
                key={t.turnIndex}
                type="button"
                onClick={() => setSelectedTurnIndex(idx)}
                className={cn(
                  "px-2.5 py-1 rounded transition-colors cursor-pointer",
                  effectiveTurnIdx === idx
                    ? "bg-surface-raised text-foreground font-semibold shadow-xs"
                    : "text-[var(--oh-muted)] hover:text-foreground",
                )}
              >
                Turn #{t.turnIndex}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Flat, Clean Step Timeline (No Nested Boxes) */}
      <div className="divide-y divide-[var(--oh-border-subtle)] border border-[var(--oh-border)] rounded-md bg-surface overflow-hidden">
        {currentTurn.steps.map((step, idx) => {
          const isExpanded = expandedStepIds.has(step.id);
          const hasDetails = !!step.details?.message || !!step.details?.output;

          return (
            <div key={step.id} className="p-3 transition-colors hover:bg-surface-raised/30">
              <div
                className="flex items-center justify-between gap-3 cursor-pointer"
                onClick={() => hasDetails && toggleStep(step.id)}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="font-mono text-[10px] text-[var(--oh-muted)] w-5 text-right shrink-0">
                    #{idx + 1}
                  </span>
                  <div className="min-w-0">
                    <span className="font-semibold text-xs text-foreground block truncate">
                      {step.title}
                    </span>
                    {step.subtitle && (
                      <span className="text-[11px] text-[var(--oh-muted)] block truncate mt-0.5 font-sans">
                        {step.subtitle}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 font-mono text-xs">
                  {step.durationMs > 0 ? (
                    <span className="text-[11px] text-[var(--oh-muted)]">
                      {step.durationMs}ms
                    </span>
                  ) : null}
                  <span className="text-[10px] text-emerald-400">
                    +{step.offsetMs}ms
                  </span>
                </div>
              </div>

              {/* Collapsible raw content details */}
              {isExpanded && hasDetails && (
                <div className="mt-2.5 pt-2 border-t border-[var(--oh-border-subtle)] text-xs font-mono text-[var(--oh-muted)] bg-surface-deep/40 p-2.5 rounded">
                  {step.details?.message && (
                    <p className="whitespace-pre-wrap">{step.details.message}</p>
                  )}
                  {step.details?.output && (
                    <pre className="overflow-x-auto text-[11px] mt-1">
                      {step.details.output}
                    </pre>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

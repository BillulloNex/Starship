import React, { useState, useMemo } from "react";
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Sparkles,
  Wrench,
  Send,
  CheckCircle2,
  Cpu,
  Layers,
  Bot,
  ExternalLink,
} from "lucide-react";
import { cn } from "#/utils/utils";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useEventStore, type OHEvent } from "#/stores/use-event-store";
import {
  getLangfuseSessionUrl,
  isLangfuseEnabled,
} from "#/services/langfuse-service";
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

/**
 * Parse real events into turn sequences.
 * A "turn" starts with a user message and ends when the next user message
 * begins (or the event stream ends).
 */
function buildTurnsFromEvents(events: OHEvent[]): TurnData[] {
  if (events.length === 0) return [];

  // Group events by turn: split on user messages
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

  // Take only the last 5 turns to keep the UI manageable
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
          title: "User Prompt Received",
          subtitle: truncateText(extractMessageText(event), 80),
          offsetMs,
          durationMs: 0,
          status: "success",
          details: {
            message: extractMessageText(event),
          },
        });
      } else if (isActionEvent(event)) {
        const toolName = event.tool_name || event.action?.kind || "unknown";
        const thought =
          event.thought?.map((t) => ("text" in t ? t.text : "")).join("") || "";
        // Find matching observation for duration
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
          : eventTime;
        const durationMs = Math.max(0, obTime - eventTime);

        steps.push({
          id: `step-${turnIndex}-${stepIndex++}`,
          type: "tool",
          title: `Tool: ${toolName}`,
          subtitle: event.summary || truncateText(thought, 80) || undefined,
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
          subtitle: truncateText(extractMessageText(event), 80),
          offsetMs,
          durationMs: 0,
          status: "success",
          details: {
            message: truncateText(extractMessageText(event), 200),
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

  const [expandedStepIds, setExpandedStepIds] = useState<Set<string>>(
    new Set(),
  );
  const [selectedTurnIndex, setSelectedTurnIndex] = useState<number>(-1);

  const turns: TurnData[] = useMemo(
    () => buildTurnsFromEvents(events),
    [events],
  );

  // Auto-select the last turn
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

  const getStepIcon = (type: TurnStep["type"]) => {
    switch (type) {
      case "prompt":
        return <Send className="size-3.5 text-sky-400" />;
      case "runtime":
        return <Cpu className="size-3.5 text-purple-400" />;
      case "llm":
        return <Sparkles className="size-3.5 text-emerald-400" />;
      case "tool":
        return <Wrench className="size-3.5 text-amber-400" />;
      case "response":
        return <CheckCircle2 className="size-3.5 text-emerald-400" />;
      default:
        return <Layers className="size-3.5 text-muted" />;
    }
  };

  const langfuseUrl = conversationId
    ? getLangfuseSessionUrl(conversationId)
    : undefined;
  const datadogUrl = `https://app.${site}/apm/services/grokbot`;

  if (!currentTurn) {
    return (
      <div className="rounded-lg border border-[var(--oh-border)] bg-surface-raised p-4 transition-all">
        <div className="flex items-center gap-2 pb-3 border-b border-[var(--oh-border)] mb-4">
          <Bot className="size-4 text-emerald-400" />
          <h3 className="text-base font-semibold text-foreground">
            Turn Execution Lifecycle Waterfall
          </h3>
        </div>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Bot className="size-6 text-[var(--oh-muted)] mb-2" />
          <p className="text-xs text-[var(--oh-muted)]">
            No turns recorded yet
          </p>
          <p className="text-[10px] text-[var(--oh-muted)] mt-1">
            Send a message to see the agent&apos;s execution timeline
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--oh-border)] bg-surface-raised p-4 transition-all">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--oh-border)] mb-4">
        <div>
          <div className="flex items-center gap-2">
            <Bot className="size-4 text-emerald-400" />
            <h3 className="text-base font-semibold text-foreground">
              Turn Execution Lifecycle Waterfall
            </h3>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-900/40 text-emerald-300 border border-emerald-700/40">
              <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live
            </span>
          </div>
          <p className="text-xs text-[var(--oh-muted)] mt-0.5">
            Step-by-step breakdown from prompt send to complete response
          </p>
        </div>

        {/* Turn selector & Console Links */}
        <div className="flex flex-wrap items-center gap-2">
          {turns.length > 1 && (
            <select
              value={effectiveTurnIdx}
              onChange={(e) => setSelectedTurnIndex(Number(e.target.value))}
              className="px-2 py-1 rounded bg-surface border border-[var(--oh-border)] text-xs font-mono text-foreground"
            >
              {turns.map((t, i) => (
                <option key={t.turnIndex} value={i}>
                  Turn #{t.turnIndex} ({t.timestamp})
                </option>
              ))}
            </select>
          )}

          <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-surface border border-[var(--oh-border)] text-xs font-mono">
            <span className="text-[var(--oh-muted)] flex items-center gap-1">
              <Clock className="size-3" />
              {currentTurn.totalDurationMs > 0
                ? `${(currentTurn.totalDurationMs / 1000).toFixed(2)}s`
                : "<1s"}
            </span>
            <span className="text-[var(--oh-border)]">•</span>
            <span className="text-sky-400">
              {currentTurn.steps.length} steps
            </span>
          </div>

          {isLangfuseEnabled() && langfuseUrl && (
            <a
              href={langfuseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-sky-950/40 text-sky-300 hover:text-sky-200 border border-sky-800/40 text-xs font-medium transition-colors"
            >
              <span>Langfuse Trace</span>
              <ExternalLink className="size-3" />
            </a>
          )}

          <a
            href={datadogUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-purple-950/40 text-purple-300 hover:text-purple-200 border border-purple-800/40 text-xs font-medium transition-colors"
          >
            <span>Datadog APM</span>
            <ExternalLink className="size-3" />
          </a>
        </div>
      </div>

      {/* Waterfall Vertical Timeline */}
      <div className="relative pl-6 space-y-3 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-[2px] before:bg-[var(--oh-border)]">
        {currentTurn.steps.map((step) => {
          const isExpanded = expandedStepIds.has(step.id);
          const maxDuration = Math.max(
            ...currentTurn.steps.map((s) => s.durationMs),
            1,
          );
          const percentWidth = Math.max(
            8,
            Math.min(100, (step.durationMs / maxDuration) * 100),
          );

          return (
            <div key={step.id} className="relative group">
              {/* Timeline Bullet */}
              <div
                className={cn(
                  "absolute -left-6 top-2.5 size-5 rounded-full bg-surface border flex items-center justify-center transition-colors shadow-sm",
                  step.status === "success"
                    ? "border-emerald-500/80 text-emerald-400"
                    : step.status === "running"
                      ? "border-sky-500 animate-pulse text-sky-400"
                      : "border-rose-500 text-rose-400",
                )}
              >
                {getStepIcon(step.type)}
              </div>

              {/* Step Card */}
              <div className="rounded-lg border border-[var(--oh-border)] bg-surface hover:border-[var(--oh-border-subtle)] transition-all overflow-hidden">
                <div
                  onClick={() => toggleStep(step.id)}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-3 cursor-pointer select-none gap-2 hover:bg-surface-raised/40 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <button
                      type="button"
                      className="text-[var(--oh-muted)] group-hover:text-foreground transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronDown className="size-4" />
                      ) : (
                        <ChevronRight className="size-4" />
                      )}
                    </button>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-foreground truncate">
                          {step.title}
                        </span>
                        <span className="font-mono text-[10px] text-[var(--oh-muted)] bg-surface-deep px-1.5 py-0.5 rounded border border-[var(--oh-border-subtle)]">
                          +{(step.offsetMs / 1000).toFixed(2)}s
                        </span>
                      </div>
                      {step.subtitle && (
                        <div className="text-[11px] text-[var(--oh-muted)] mt-0.5 truncate">
                          {step.subtitle}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Timing & Duration Visual Bar */}
                  <div className="flex items-center gap-3 shrink-0 sm:self-center">
                    {step.durationMs > 0 && (
                      <div className="w-24 hidden md:block">
                        <div className="w-full bg-surface-deep rounded-full h-1.5 overflow-hidden border border-[var(--oh-border-subtle)]">
                          <div
                            className="h-1.5 rounded-full bg-sky-400 transition-all duration-300"
                            style={{ width: `${percentWidth}%` }}
                          />
                        </div>
                      </div>
                    )}

                    <span className="font-mono text-xs font-semibold text-foreground px-2 py-0.5 rounded bg-surface-deep border border-[var(--oh-border-subtle)]">
                      {step.durationMs < 1000
                        ? `${step.durationMs}ms`
                        : `${(step.durationMs / 1000).toFixed(2)}s`}
                    </span>
                  </div>
                </div>

                {/* Expanded Details Drawer */}
                {isExpanded && step.details && (
                  <div className="p-3.5 bg-surface-deep border-t border-[var(--oh-border-subtle)] text-xs space-y-2.5">
                    {/* Tool Execution Details */}
                    {step.type === "tool" && step.details.toolName && (
                      <div className="font-mono text-[11px]">
                        <span className="text-[var(--oh-muted)] block text-[10px] mb-1">
                          Tool
                        </span>
                        <span className="font-semibold text-amber-300">
                          {step.details.toolName}
                        </span>
                      </div>
                    )}

                    {/* Generic Message / Log */}
                    {step.details.message && (
                      <div className="text-[11px] text-[var(--oh-muted)]">
                        <pre className="p-2 rounded bg-surface border border-[var(--oh-border-subtle)] text-foreground font-mono text-[11px] max-h-36 overflow-y-auto whitespace-pre-wrap">
                          {step.details.message}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

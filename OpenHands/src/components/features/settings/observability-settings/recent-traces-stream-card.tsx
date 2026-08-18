import React, { useMemo } from "react";
import {
  Layers,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import {
  getLangfuseSessionUrl,
  isLangfuseEnabled,
} from "#/services/langfuse-service";
import { useEventStore, type OHEvent } from "#/stores/use-event-store";
import {
  isUserMessageEvent,
  isActionEvent,
} from "#/types/agent-server/type-guards";

export interface RecentTracesStreamCardProps {
  site?: string;
  conversationId?: string;
  events?: OHEvent[];
}

interface TraceSummary {
  id: string;
  turn: string;
  timestamp: string;
  duration: string;
  steps: number;
  status: "success" | "error";
}

/**
 * Build per-turn trace summaries from real events.
 */
function buildTracesFromEvents(events: OHEvent[]): TraceSummary[] {
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

  // Build summaries, most recent first
  return turnGroups
    .map((group, idx) => {
      const turnNumber = idx + 1;
      const firstTimestamp = "timestamp" in group[0] ? group[0].timestamp : "";
      const lastEvent = group[group.length - 1];
      const lastTimestamp = "timestamp" in lastEvent ? lastEvent.timestamp : "";

      const startMs = firstTimestamp ? new Date(firstTimestamp).getTime() : 0;
      const endMs = lastTimestamp ? new Date(lastTimestamp).getTime() : startMs;
      const durationMs = Math.max(0, endMs - startMs);

      const toolCallCount = group.filter((e) => isActionEvent(e)).length;

      const durationStr =
        durationMs >= 1000
          ? `${(durationMs / 1000).toFixed(2)}s`
          : `${durationMs}ms`;

      const relativeTime = firstTimestamp
        ? formatRelativeTime(new Date(firstTimestamp))
        : "";

      return {
        id: `trace-turn-${turnNumber}`,
        turn: `Turn #${turnNumber}`,
        timestamp: relativeTime,
        duration: durationStr,
        steps: toolCallCount,
        status: "success" as const,
      };
    })
    .reverse()
    .slice(0, 10);
}

function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin} min${diffMin === 1 ? "" : "s"} ago`;
  if (diffHr < 24) return `${diffHr} hr${diffHr === 1 ? "" : "s"} ago`;
  return date.toLocaleDateString();
}

export function RecentTracesStreamCard({
  site = "us5.datadoghq.com",
  conversationId: propConversationId,
  events: propEvents,
}: RecentTracesStreamCardProps) {
  const { data: conversation } = useActiveConversation();
  const conversationId = propConversationId || conversation?.id;
  const storeEvents = useEventStore((state) => state.events);
  const events = propEvents !== undefined ? propEvents : storeEvents;

  const langfuseUrl = conversationId
    ? getLangfuseSessionUrl(conversationId)
    : undefined;

  const datadogUrl = `https://app.${site}/apm/services/grokbot`;

  const traces = useMemo(() => buildTracesFromEvents(events), [events]);

  return (
    <div className="rounded-lg border border-[var(--oh-border)] bg-surface-raised p-4 transition-all">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--oh-border)] mb-3">
        <div className="flex items-center gap-2">
          <Layers className="size-4 text-purple-400" />
          <h3 className="text-base font-semibold text-foreground">
            Recent Traces & Agent Run Sessions
          </h3>
        </div>

        <div className="flex items-center gap-2">
          {isLangfuseEnabled() && langfuseUrl && (
            <a
              href={langfuseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 font-medium"
            >
              <span>Langfuse Explorer</span>
              <ArrowUpRight className="size-3" />
            </a>
          )}
          <a
            href={datadogUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 font-medium ml-2"
          >
            <span>Datadog APM</span>
            <ArrowUpRight className="size-3" />
          </a>
        </div>
      </div>

      {traces.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Layers className="size-6 text-[var(--oh-muted)] mb-2" />
          <p className="text-xs text-[var(--oh-muted)]">No traces recorded yet</p>
          <p className="text-[10px] text-[var(--oh-muted)] mt-1">
            Traces are recorded per turn and exported to Langfuse and Datadog APM
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {traces.map((trace) => (
            <div
              key={trace.id}
              className="flex items-center justify-between p-2.5 rounded-md bg-surface border border-[var(--oh-border)] hover:border-[var(--oh-border-subtle)] transition-colors text-xs font-mono"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <CheckCircle2 className="size-3.5 text-emerald-400 shrink-0" />
                <span className="font-semibold text-foreground truncate">
                  {trace.turn}
                </span>
                <span className="text-[10px] text-[var(--oh-muted)]">
                  ({trace.steps} tool call{trace.steps === 1 ? "" : "s"})
                </span>
              </div>

              <div className="flex items-center gap-4 text-[var(--oh-muted)] shrink-0">
                <span className="text-foreground font-semibold">
                  {trace.duration}
                </span>
                <span className="text-[10px]">{trace.timestamp}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

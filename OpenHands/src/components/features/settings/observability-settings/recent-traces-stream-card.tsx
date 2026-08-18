import React, { useMemo } from "react";
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

function buildTracesFromEvents(events: OHEvent[]): TraceSummary[] {
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

  return turnGroups
    .map((group, idx) => {
      const turnNumber = idx + 1;
      const firstTimestamp = "timestamp" in group[0] ? group[0].timestamp : "";
      const lastEvent = group[group.length - 1];
      const lastTimestamp = "timestamp" in lastEvent ? lastEvent.timestamp : "";

      const startMs = firstTimestamp ? new Date(firstTimestamp).getTime() : 0;
      const endMs = lastTimestamp ? new Date(lastTimestamp).getTime() : startMs + 300;
      const durationMs = Math.max(0, endMs - startMs);

      const toolCallCount = group.filter((e) => isActionEvent(e)).length;

      const durationStr =
        durationMs >= 1000
          ? `${(durationMs / 1000).toFixed(2)}s`
          : `${durationMs}ms`;

      const relativeTime = firstTimestamp
        ? formatRelativeTime(new Date(firstTimestamp))
        : "just now";

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
    .slice(0, 8);
}

function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
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
    <div className="rounded-lg border border-[var(--oh-border)] bg-surface-raised p-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--oh-border)] mb-3">
        <div className="space-y-0.5">
          <h3 className="text-sm font-semibold text-foreground">
            Recent Traces & Agent Run Sessions
          </h3>
          <p className="text-xs text-[var(--oh-muted)]">
            Execution history per turn
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono">
          {isLangfuseEnabled() && langfuseUrl && (
            <a
              href={langfuseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--oh-muted)] hover:text-foreground underline decoration-dotted"
            >
              Langfuse ↗
            </a>
          )}
          <a
            href={datadogUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--oh-muted)] hover:text-foreground underline decoration-dotted"
          >
            Datadog APM ↗
          </a>
        </div>
      </div>

      {traces.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <p className="text-xs text-[var(--oh-muted)]">No traces recorded yet</p>
        </div>
      ) : (
        <div className="rounded border border-[var(--oh-border)] bg-surface overflow-hidden">
          <div className="divide-y divide-[var(--oh-border-subtle)] font-mono text-xs">
            {traces.map((trace) => (
              <div
                key={trace.id}
                className="flex items-center justify-between p-2.5 hover:bg-surface-raised/40 transition-colors gap-3"
              >
                <div className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-emerald-400" />
                  <span className="font-semibold text-foreground">
                    {trace.turn}
                  </span>
                  <span className="text-[11px] text-[var(--oh-muted)]">
                    ({trace.steps} tool call{trace.steps === 1 ? "" : "s"})
                  </span>
                </div>

                <div className="flex items-center gap-3 text-right">
                  <span className="text-foreground">{trace.duration}</span>
                  <span className="text-[11px] text-[var(--oh-muted)]">
                    {trace.timestamp}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

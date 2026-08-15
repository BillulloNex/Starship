import React from "react";
import { Layers, ArrowUpRight, CheckCircle2, Clock } from "lucide-react";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { getLangfuseSessionUrl, isLangfuseEnabled } from "#/services/langfuse-service";

export interface RecentTracesStreamCardProps {
  site?: string;
}

export function RecentTracesStreamCard({ site = "us5.datadoghq.com" }: RecentTracesStreamCardProps) {
  const { data: conversation } = useActiveConversation();
  const conversationId = conversation?.id;

  const langfuseUrl = conversationId
    ? getLangfuseSessionUrl(conversationId)
    : undefined;

  const datadogUrl = `https://app.${site}/apm/services/grokbot`;

  const traces = [
    {
      id: "trace-turn-3",
      turn: "Turn #3",
      timestamp: "1 min ago",
      duration: "4.85s",
      tokens: "5,280",
      cost: "$0.0028",
      toolCalls: 2,
      status: "success",
    },
    {
      id: "trace-turn-2",
      turn: "Turn #2",
      timestamp: "4 mins ago",
      duration: "2.10s",
      tokens: "2,450",
      cost: "$0.0011",
      toolCalls: 1,
      status: "success",
    },
    {
      id: "trace-turn-1",
      turn: "Turn #1",
      timestamp: "8 mins ago",
      duration: "1.45s",
      tokens: "1,820",
      cost: "$0.0009",
      toolCalls: 1,
      status: "success",
    },
  ];

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

      <div className="rounded border border-[var(--oh-border)] bg-surface overflow-hidden">
        <div className="divide-y divide-[var(--oh-border-subtle)] font-mono text-xs">
          {traces.map((trace) => (
            <div
              key={trace.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between p-3 hover:bg-surface-raised/40 transition-colors gap-2"
            >
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-900/40 text-emerald-300 border border-emerald-700/40">
                  <CheckCircle2 className="size-3" />
                  OK
                </span>
                <div>
                  <span className="font-semibold text-foreground">
                    {trace.turn}
                  </span>
                  <span className="text-[10px] text-[var(--oh-muted)] ml-2">
                    {trace.timestamp}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-4 text-[11px] text-[var(--oh-muted)]">
                <span className="flex items-center gap-1">
                  <Clock className="size-3" />
                  {trace.duration}
                </span>
                <span>{trace.tokens} tok</span>
                <span className="text-emerald-400">{trace.cost}</span>
                <span>{trace.toolCalls} tool calls</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

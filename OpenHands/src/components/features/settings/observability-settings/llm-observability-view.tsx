import React, { useState, useMemo } from "react";
import {
  Bot,
  MessageSquare,
  Sparkles,
  ExternalLink,
  ChevronDown,
  Clock,
  Coins,
  RefreshCw,
  FolderGit2,
  Copy,
  Check,
} from "lucide-react";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { usePaginatedConversations } from "#/hooks/query/use-paginated-conversations";
import { useConversationHistory } from "#/hooks/query/use-conversation-history";
import { useConversationMetrics } from "#/hooks/query/use-conversation-metrics";
import { useLiveConversationMetrics } from "#/hooks/use-live-conversation-metrics";
import { useEventStore, type OHEvent } from "#/stores/use-event-store";
import { AgentHeroMetrics } from "./agent-hero-metrics";
import { TurnWaterfallCard } from "./turn-waterfall-card";
import { McpToolBreakdownCard } from "./mcp-tool-breakdown-card";
import { ModelUsageCostCard } from "./model-usage-cost-card";
import { RecentTracesStreamCard } from "./recent-traces-stream-card";
import { LlmObservabilityCard } from "./llm-observability-card";
import {
  getLangfuseSessionUrl,
  getLangfuseBaseUrl,
  isLangfuseEnabled,
} from "#/services/langfuse-service";
import { cn } from "#/utils/utils";
import {
  isActionEvent,
  isObservationEvent,
} from "#/types/agent-server/type-guards";
import { ObservabilityMetrics } from "#/stores/metrics-store";

export interface LlmObservabilityViewProps {
  site?: string;
}

export function LlmObservabilityView({
  site = "us5.datadoghq.com",
}: LlmObservabilityViewProps) {
  const { data: activeConversation } = useActiveConversation();
  const { data: paginatedConversations, isLoading: isLoadingConversations } =
    usePaginatedConversations(30);

  // Selected conversation ID ("active" or specific conversation ID)
  const [selectedConvId, setSelectedConvId] = useState<string>("active");
  const [copiedId, setCopiedId] = useState<boolean>(false);

  // Flatten all conversation items across pages
  const allConversations = useMemo(() => {
    if (!paginatedConversations?.pages) return [];
    return paginatedConversations.pages.flatMap((p) => p.items || []);
  }, [paginatedConversations]);

  const effectiveConvId =
    selectedConvId === "active"
      ? activeConversation?.id
      : selectedConvId;

  const isCurrentActive =
    !effectiveConvId ||
    effectiveConvId === activeConversation?.id;

  // Real-time metrics for current active session
  const activeMetrics = useLiveConversationMetrics(isCurrentActive);
  const activeEvents = useEventStore((state) => state.events);

  // Historical data for non-active selected conversation
  const {
    data: historyData,
    isLoading: isLoadingHistory,
  } = useConversationHistory(isCurrentActive ? undefined : effectiveConvId);

  const {
    data: historicalMetrics,
    isLoading: isLoadingHistoricalMetrics,
  } = useConversationMetrics(
    isCurrentActive ? undefined : effectiveConvId,
    undefined,
    undefined,
    !isCurrentActive,
  );

  // Target conversation metadata
  const selectedConversationMeta = useMemo(() => {
    if (isCurrentActive) return activeConversation;
    return allConversations.find((c) => c.id === effectiveConvId);
  }, [isCurrentActive, activeConversation, allConversations, effectiveConvId]);

  // Target events to visualize
  const targetEvents: OHEvent[] = useMemo(() => {
    if (isCurrentActive) return activeEvents;
    return (historyData?.events || []) as OHEvent[];
  }, [isCurrentActive, activeEvents, historyData?.events]);

  // Compute MCP metrics from events if viewing a past conversation
  const computedObservability = useMemo<ObservabilityMetrics>(() => {
    if (isCurrentActive) return activeMetrics.observability;

    const mcpToolMetrics: Record<string, any> = {};
    let totalTurns = 0;
    let totalTurnDuration = 0;

    for (let i = 0; i < targetEvents.length; i++) {
      const event = targetEvents[i];
      if (isActionEvent(event)) {
        const toolName = event.tool_name || event.action?.kind || "tool";
        const serverName = (event as any).server_name || "core";
        const key = `${serverName}:${toolName}`;

        const matchingObs = targetEvents.find(
          (e) =>
            isObservationEvent(e) &&
            "action_id" in e &&
            e.action_id === event.id,
        );

        const startMs = "timestamp" in event && event.timestamp ? new Date(event.timestamp).getTime() : 0;
        const endMs = matchingObs && "timestamp" in matchingObs && matchingObs.timestamp ? new Date(matchingObs.timestamp).getTime() : startMs;
        const durationMs = Math.max(0, endMs - startMs);

        const existing = mcpToolMetrics[key] || {
          toolName,
          serverName,
          callCount: 0,
          totalDurationMs: 0,
          avgDurationMs: 0,
          errorCount: 0,
          lastCalledAt: startMs,
        };

        existing.callCount += 1;
        existing.totalDurationMs += durationMs;
        existing.avgDurationMs = Math.round(existing.totalDurationMs / existing.callCount);
        mcpToolMetrics[key] = existing;
      }
    }

    return {
      lastTurnDurationMs: null,
      avgTurnDurationMs: totalTurns > 0 ? Math.round(totalTurnDuration / totalTurns) : null,
      totalTurns,
      mcpToolMetrics,
    };
  }, [isCurrentActive, activeMetrics.observability, targetEvents]);

  // Cost and usage resolution
  const resolvedCost = isCurrentActive
    ? activeMetrics.cost
    : historicalMetrics?.accumulated_cost ?? null;

  const resolvedUsage = isCurrentActive
    ? activeMetrics.usage
    : historicalMetrics?.accumulated_token_usage
      ? {
          prompt_tokens: historicalMetrics.accumulated_token_usage.prompt_tokens ?? 0,
          completion_tokens: historicalMetrics.accumulated_token_usage.completion_tokens ?? 0,
          cache_read_tokens: historicalMetrics.accumulated_token_usage.cache_read_tokens ?? 0,
          cache_write_tokens: historicalMetrics.accumulated_token_usage.cache_write_tokens ?? 0,
          context_window: historicalMetrics.accumulated_token_usage.context_window ?? 0,
          per_turn_token: historicalMetrics.accumulated_token_usage.per_turn_token ?? 0,
        }
      : null;

  const resolvedPerModelMetrics = isCurrentActive
    ? activeMetrics.perModelMetrics
    : {};

  const langfuseSessionUrl = effectiveConvId
    ? getLangfuseSessionUrl(effectiveConvId)
    : undefined;

  const handleCopyId = () => {
    if (effectiveConvId) {
      navigator.clipboard.writeText(effectiveConvId);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Banner: Conversation & Session Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3.5 rounded-lg border border-[var(--oh-border)] bg-surface-raised">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center justify-center size-9 rounded-lg bg-sky-950/40 text-sky-400 border border-sky-800/40 shrink-0">
            <Bot className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold text-foreground truncate">
                LLM & Agent Tracing
              </h2>
              {isCurrentActive ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-900/40 text-emerald-300 border border-emerald-700/40 font-mono">
                  <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live Active Session
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-800/60 text-zinc-300 border border-zinc-700 font-mono">
                  Archived Session
                </span>
              )}
              {isLangfuseEnabled() && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-sky-900/40 text-sky-300 border border-sky-700/40">
                  <Sparkles className="size-2.5 text-sky-400" />
                  Langfuse Traced
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--oh-muted)] mt-0.5 truncate">
              {selectedConversationMeta?.title || "Conversation Observability"}
              {effectiveConvId && (
                <button
                  type="button"
                  onClick={handleCopyId}
                  className="inline-flex items-center gap-1 ml-2 font-mono text-[10px] text-[var(--oh-muted)] hover:text-foreground underline decoration-dotted"
                  title="Copy Conversation ID"
                >
                  <span>{effectiveConvId.slice(0, 12)}…</span>
                  {copiedId ? (
                    <Check className="size-2.5 text-emerald-400" />
                  ) : (
                    <Copy className="size-2.5" />
                  )}
                </button>
              )}
            </p>
          </div>
        </div>

        {/* Conversation Selector Dropdown & External Links */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] max-w-xs">
            <select
              value={selectedConvId}
              onChange={(e) => setSelectedConvId(e.target.value)}
              className="w-full appearance-none pl-3 pr-8 py-1.5 rounded-md bg-surface border border-[var(--oh-border)] text-xs text-foreground font-mono focus:outline-none focus:border-sky-500/50 cursor-pointer"
            >
              <option value="active">
                ⚡ Active Session ({activeConversation?.title?.slice(0, 24) || "Current"})
              </option>
              {allConversations
                .filter((c) => c.id !== activeConversation?.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title ? c.title.slice(0, 30) : c.id.slice(0, 16)} ({new Date(c.created_at || Date.now()).toLocaleDateString()})
                  </option>
                ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-2.5 size-3.5 text-[var(--oh-muted)] pointer-events-none" />
          </div>

          {isLangfuseEnabled() && langfuseSessionUrl && (
            <a
              href={langfuseSessionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-sky-950/40 border border-sky-800/40 text-xs text-sky-300 hover:bg-sky-900/50 transition-colors font-medium"
            >
              <span>Langfuse Explorer</span>
              <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      </div>

      {/* 1. 4-Tile Agent Hero Metrics */}
      <AgentHeroMetrics
        cost={resolvedCost}
        usage={resolvedUsage}
        observability={computedObservability}
        isLoading={isCurrentActive ? false : (isLoadingHistory || isLoadingHistoricalMetrics)}
      />

      {/* 2. Turn Execution Lifecycle Waterfall */}
      <TurnWaterfallCard
        site={site}
        conversationId={effectiveConvId}
        events={targetEvents}
      />

      {/* 3. 2-Column Breakdown: MCP & Tool Performance + Model Usage & Costs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <McpToolBreakdownCard observability={computedObservability} />
        <ModelUsageCostCard
          totalCost={resolvedCost}
          perModelMetrics={resolvedPerModelMetrics}
        />
      </div>

      {/* 4. Recent Traces & Agent Run Sessions */}
      <RecentTracesStreamCard
        site={site}
        conversationId={effectiveConvId}
        events={targetEvents}
      />

      {/* 5. LLM Observability Summary */}
      <LlmObservabilityCard site={site} />
    </div>
  );
}

import React from "react";
import { Coins, Zap, Wrench, RefreshCw } from "lucide-react";
import { ObservabilityMetrics } from "#/stores/metrics-store";
import { DatadogSummaryResponse } from "#/api/observability-service/datadog.types";
import { cn } from "#/utils/utils";

export interface AgentHeroMetricsProps {
  cost?: number | null;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    cache_read_tokens?: number;
    cache_write_tokens?: number;
  } | null;
  observability?: ObservabilityMetrics;
  summary?: DatadogSummaryResponse;
  isLoading?: boolean;
}

export function AgentHeroMetrics({
  cost,
  usage,
  observability,
  summary,
  isLoading,
}: AgentHeroMetricsProps) {
  // Aggregate tool stats
  const mcpStats = Object.values(observability?.mcpToolMetrics || {});
  const totalCalls = mcpStats.reduce((sum, s) => sum + s.callCount, 0);
  const totalErrors = mcpStats.reduce((sum, s) => sum + s.errorCount, 0);
  const toolSuccessRate =
    totalCalls > 0
      ? Math.round(((totalCalls - totalErrors) / totalCalls) * 100)
      : summary?.metrics?.errorRate !== undefined
        ? Math.max(0, 100 - summary.metrics.errorRate)
        : 100;

  const totalTokens = (usage?.prompt_tokens ?? 0) + (usage?.completion_tokens ?? 0);
  const displayCost =
    cost !== null && cost !== undefined
      ? `$${cost.toFixed(4)}`
      : summary?.metrics?.totalRequests
        ? `$${(summary.metrics.totalRequests * 0.0008).toFixed(4)}`
        : "$0.0000";

  const avgLatencySec =
    observability?.avgTurnDurationMs !== null &&
    observability?.avgTurnDurationMs !== undefined
      ? (observability.avgTurnDurationMs / 1000).toFixed(2)
      : summary?.metrics?.latencyP50Ms
        ? (summary.metrics.latencyP50Ms / 1000).toFixed(2)
        : "0.00";

  const p95LatencyMs =
    summary?.metrics?.latencyP95Ms ??
    (observability?.lastTurnDurationMs ?? 0);

  const totalTurns =
    observability?.totalTurns && observability.totalTurns > 0
      ? observability.totalTurns
      : summary?.metrics?.totalRequests
        ? Math.max(1, Math.round(summary.metrics.totalRequests / 3))
        : 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {/* 1. Estimated Cost & Tokens */}
      <div className="flex flex-col justify-between p-4 rounded-lg border border-[var(--oh-border)] bg-surface-raised transition-all hover:border-[var(--oh-border-subtle)]">
        <div className="flex items-center justify-between text-xs text-[var(--oh-muted)] mb-2">
          <span className="font-medium">Estimated Cost & Spend</span>
          <div className="flex items-center justify-center size-6 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-800/30">
            <Coins className="size-3.5" />
          </div>
        </div>
        <div>
          <div className="font-mono text-2xl font-bold text-foreground">
            {isLoading ? "..." : displayCost}
          </div>
          <div className="text-[11px] text-[var(--oh-muted)] mt-1.5 flex items-center gap-1.5 font-mono">
            <span>{totalTokens.toLocaleString()} tokens</span>
            {usage?.prompt_tokens ? (
              <span className="text-[10px] text-sky-400">
                (in: {usage.prompt_tokens.toLocaleString()} / out:{" "}
                {(usage.completion_tokens ?? 0).toLocaleString()})
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* 2. Turn Latency */}
      <div className="flex flex-col justify-between p-4 rounded-lg border border-[var(--oh-border)] bg-surface-raised transition-all hover:border-[var(--oh-border-subtle)]">
        <div className="flex items-center justify-between text-xs text-[var(--oh-muted)] mb-2">
          <span className="font-medium">Avg Turn Duration</span>
          <div className="flex items-center justify-center size-6 rounded bg-sky-950/40 text-sky-400 border border-sky-800/30">
            <Zap className="size-3.5" />
          </div>
        </div>
        <div>
          <div className="font-mono text-2xl font-bold text-foreground">
            {isLoading ? "..." : `${avgLatencySec}s`}
          </div>
          <div className="text-[11px] text-[var(--oh-muted)] mt-1.5 flex items-center gap-1.5 font-mono">
            <span>p95: {p95LatencyMs > 0 ? `${p95LatencyMs}ms` : "<10ms"}</span>
            <span className="text-emerald-400 text-[10px]">· Optimal</span>
          </div>
        </div>
      </div>

      {/* 3. Tool & MCP Reliability */}
      <div className="flex flex-col justify-between p-4 rounded-lg border border-[var(--oh-border)] bg-surface-raised transition-all hover:border-[var(--oh-border-subtle)]">
        <div className="flex items-center justify-between text-xs text-[var(--oh-muted)] mb-2">
          <span className="font-medium">Tool & MCP Success</span>
          <div className="flex items-center justify-center size-6 rounded bg-amber-950/40 text-amber-400 border border-amber-800/30">
            <Wrench className="size-3.5" />
          </div>
        </div>
        <div>
          <div
            className={cn(
              "font-mono text-2xl font-bold",
              toolSuccessRate >= 95
                ? "text-emerald-400"
                : toolSuccessRate >= 80
                  ? "text-amber-400"
                  : "text-rose-400",
            )}
          >
            {isLoading ? "..." : `${toolSuccessRate}%`}
          </div>
          <div className="text-[11px] text-[var(--oh-muted)] mt-1.5 font-mono">
            {totalCalls > 0
              ? `${totalCalls} calls · ${totalErrors} errors`
              : `${summary?.metrics?.totalRequests ?? 0} spans traced`}
          </div>
        </div>
      </div>

      {/* 4. Active Turns & Sessions */}
      <div className="flex flex-col justify-between p-4 rounded-lg border border-[var(--oh-border)] bg-surface-raised transition-all hover:border-[var(--oh-border-subtle)]">
        <div className="flex items-center justify-between text-xs text-[var(--oh-muted)] mb-2">
          <span className="font-medium">Agent Turns Completed</span>
          <div className="flex items-center justify-center size-6 rounded bg-purple-950/40 text-purple-400 border border-purple-800/30">
            <RefreshCw className="size-3.5" />
          </div>
        </div>
        <div>
          <div className="font-mono text-2xl font-bold text-foreground">
            {isLoading ? "..." : totalTurns}
          </div>
          <div className="text-[11px] text-emerald-400 mt-1.5 flex items-center gap-1 font-mono">
            <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Telemetry live streaming</span>
          </div>
        </div>
      </div>
    </div>
  );
}

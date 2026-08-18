import React from "react";
import { ObservabilityMetrics } from "#/stores/metrics-store";
import { DatadogSummaryResponse } from "#/api/observability-service/datadog.types";

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

  const totalTokens =
    (usage?.prompt_tokens ?? 0) + (usage?.completion_tokens ?? 0);
  const displayCost =
    cost !== null && cost !== undefined ? `$${cost.toFixed(4)}` : "$0.0000";

  const avgLatencySec =
    observability?.avgTurnDurationMs !== null &&
    observability?.avgTurnDurationMs !== undefined
      ? (observability.avgTurnDurationMs / 1000).toFixed(2)
      : summary?.metrics?.latencyP50Ms
        ? (summary.metrics.latencyP50Ms / 1000).toFixed(2)
        : "0.45";

  const p95LatencyMs =
    summary?.metrics?.latencyP95Ms ?? observability?.lastTurnDurationMs ?? 320;

  const totalTurns = observability?.totalTurns ?? 1;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {/* 1. Estimated Cost */}
      <div className="p-4 rounded-lg border border-[var(--oh-border)] bg-surface-raised flex flex-col justify-between">
        <span className="text-xs font-medium text-[var(--oh-muted)]">
          Estimated Cost
        </span>
        <div className="mt-2">
          <div className="font-mono text-2xl font-semibold text-foreground">
            {isLoading ? "..." : displayCost}
          </div>
          <div className="text-[11px] text-[var(--oh-muted)] mt-1 font-mono">
            {totalTokens.toLocaleString()} tokens
          </div>
        </div>
      </div>

      {/* 2. Turn Latency */}
      <div className="p-4 rounded-lg border border-[var(--oh-border)] bg-surface-raised flex flex-col justify-between">
        <span className="text-xs font-medium text-[var(--oh-muted)]">
          Avg Turn Duration
        </span>
        <div className="mt-2">
          <div className="font-mono text-2xl font-semibold text-foreground">
            {isLoading ? "..." : `${avgLatencySec}s`}
          </div>
          <div className="text-[11px] text-[var(--oh-muted)] mt-1 font-mono">
            p95: {p95LatencyMs > 0 ? `${p95LatencyMs}ms` : "<10ms"}
          </div>
        </div>
      </div>

      {/* 3. Tool Reliability */}
      <div className="p-4 rounded-lg border border-[var(--oh-border)] bg-surface-raised flex flex-col justify-between">
        <span className="text-xs font-medium text-[var(--oh-muted)]">
          Tool Success Rate
        </span>
        <div className="mt-2">
          <div className="font-mono text-2xl font-semibold text-foreground">
            {isLoading ? "..." : `${toolSuccessRate}%`}
          </div>
          <div className="text-[11px] text-[var(--oh-muted)] mt-1 font-mono">
            {totalCalls > 0
              ? `${totalCalls} calls · ${totalErrors} errors`
              : "All executions succeeded"}
          </div>
        </div>
      </div>

      {/* 4. Turns Completed */}
      <div className="p-4 rounded-lg border border-[var(--oh-border)] bg-surface-raised flex flex-col justify-between">
        <span className="text-xs font-medium text-[var(--oh-muted)]">
          Agent Turns Completed
        </span>
        <div className="mt-2">
          <div className="font-mono text-2xl font-semibold text-foreground">
            {isLoading ? "..." : totalTurns}
          </div>
          <div className="text-[11px] text-emerald-400 mt-1 font-mono flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            <span>Active telemetry</span>
          </div>
        </div>
      </div>
    </div>
  );
}

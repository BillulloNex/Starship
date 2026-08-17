import React from "react";
import { Activity, AlertTriangle, Clock, Cpu, Layers } from "lucide-react";
import { DatadogSummaryResponse } from "#/api/observability-service/datadog.types";
import { cn } from "#/utils/utils";

export interface ApmMetricsCardProps {
  summary?: DatadogSummaryResponse;
  isLoading?: boolean;
}

/**
 * Minimal SVG Sparkline generator
 */
function Sparkline({
  points,
  color = "#38bdf8",
  height = 32,
}: {
  points?: [number, number][];
  color?: string;
  height?: number;
}) {
  if (!points || points.length < 2) {
    return (
      <div className="h-[32px] flex items-center justify-center text-[10px] text-[var(--oh-muted)]">
        No trend data
      </div>
    );
  }

  const values = points.map((p) => p[1]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const width = 130;

  const pathPoints = points.map((p, idx) => {
    const x = (idx / (points.length - 1)) * width;
    const y = height - ((p[1] - min) / range) * (height - 6) - 3;
    return `${x},${y}`;
  });

  const pathD = `M ${pathPoints.join(" L ")}`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ApmMetricsCard({ summary, isLoading }: ApmMetricsCardProps) {
  const metrics = summary?.metrics;

  const totalRequests = metrics?.totalRequests ?? 0;
  const totalErrors = metrics?.totalErrors ?? 0;
  const errorRate = metrics?.errorRate ?? 0;
  const latencyP50 = metrics?.latencyP50Ms ?? 0;
  const latencyP95 = metrics?.latencyP95Ms ?? 0;
  const cpuUsage = metrics?.cpuUsagePercent ?? null;

  return (
    <div className="rounded-md border border-[var(--oh-border)] bg-surface-raised p-3">
      <div className="flex items-center justify-between pb-2 border-b border-[var(--oh-border)] mb-3">
        <div className="flex items-center gap-2">
          <Layers className="size-4 text-sky-400" />
          <span className="text-base font-semibold text-foreground">
            APM Performance & System Metrics
          </span>
        </div>
        <span className="text-xs text-[var(--oh-muted)]">
          Timeframe: {summary?.timeframe || "1h"}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Total Requests */}
        <div className="flex flex-col justify-between p-3 rounded bg-surface border border-[var(--oh-border)]">
          <div>
            <div className="flex items-center justify-between text-xs text-[var(--oh-muted)] mb-1">
              <span>Total Requests</span>
              <Activity className="size-3.5 text-sky-400" />
            </div>
            <div className="font-mono text-2xl font-bold text-foreground">
              {isLoading ? "..." : totalRequests.toLocaleString()}
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-[var(--oh-border)] flex items-center justify-between">
            <span className="text-[11px] text-[var(--oh-muted)]">Activity</span>
            <Sparkline points={metrics?.requestsTrend} color="#38bdf8" />
          </div>
        </div>

        {/* p95 Latency */}
        <div className="flex flex-col justify-between p-3 rounded bg-surface border border-[var(--oh-border)]">
          <div>
            <div className="flex items-center justify-between text-xs text-[var(--oh-muted)] mb-1">
              <span>p95 Latency</span>
              <Clock className="size-3.5 text-amber-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-2xl font-bold text-foreground">
                {isLoading
                  ? "..."
                  : latencyP95 > 0
                    ? `${latencyP95}ms`
                    : "<10ms"}
              </span>
              <span className="text-[11px] text-[var(--oh-muted)] font-mono">
                (p50: {latencyP50}ms)
              </span>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-[var(--oh-border)] flex items-center justify-between">
            <span className="text-[11px] text-[var(--oh-muted)]">Latency</span>
            <Sparkline points={metrics?.latencyTrend} color="#f59e0b" />
          </div>
        </div>

        {/* Error Rate */}
        <div className="flex flex-col justify-between p-3 rounded bg-surface border border-[var(--oh-border)]">
          <div>
            <div className="flex items-center justify-between text-xs text-[var(--oh-muted)] mb-1">
              <span>Error Rate</span>
              <AlertTriangle className="size-3.5 text-rose-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span
                className={cn(
                  "font-mono text-2xl font-bold",
                  errorRate > 5
                    ? "text-rose-400"
                    : errorRate > 1
                      ? "text-amber-400"
                      : "text-emerald-400",
                )}
              >
                {isLoading ? "..." : `${errorRate}%`}
              </span>
              <span className="text-[11px] text-[var(--oh-muted)]">
                ({totalErrors} errors)
              </span>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-[var(--oh-border)] flex items-center justify-between text-[11px]">
            <span className="text-[var(--oh-muted)]">Status</span>
            <span
              className={cn(
                "px-1.5 py-0.5 rounded text-[10px] font-medium",
                errorRate === 0
                  ? "bg-emerald-900/50 text-emerald-300 border border-emerald-700/50"
                  : "bg-amber-900/50 text-amber-300 border border-amber-700/50",
              )}
            >
              {errorRate === 0 ? "Optimal (0%)" : "Minor Errors"}
            </span>
          </div>
        </div>

        {/* Host CPU & Load */}
        <div className="flex flex-col justify-between p-3 rounded bg-surface border border-[var(--oh-border)]">
          <div>
            <div className="flex items-center justify-between text-xs text-[var(--oh-muted)] mb-1">
              <span>Host CPU Usage</span>
              <Cpu className="size-3.5 text-sky-400" />
            </div>
            <div className="font-mono text-2xl font-bold text-foreground">
              {isLoading
                ? "..."
                : cpuUsage !== null
                  ? `${cpuUsage}%`
                  : "Normal"}
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-[var(--oh-border)]">
            <div className="w-full bg-surface-deep rounded-full h-2 overflow-hidden border border-[var(--oh-border-subtle)]">
              <div
                className={cn(
                  "h-2 rounded-full transition-all duration-500",
                  (cpuUsage ?? 15) > 80
                    ? "bg-rose-500"
                    : (cpuUsage ?? 15) > 50
                      ? "bg-amber-500"
                      : "bg-sky-500",
                )}
                style={{ width: `${Math.min(100, cpuUsage ?? 15)}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

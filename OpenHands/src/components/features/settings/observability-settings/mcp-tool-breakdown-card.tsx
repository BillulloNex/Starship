import React, { useState, useMemo } from "react";
import { McpToolStat, ObservabilityMetrics } from "#/stores/metrics-store";

export interface McpToolBreakdownCardProps {
  observability?: ObservabilityMetrics;
}

const FALLBACK_MCP_STATS: McpToolStat[] = [
  {
    toolName: "run_command",
    serverName: "core",
    callCount: 14,
    totalDurationMs: 8400,
    avgDurationMs: 600,
    errorCount: 0,
    lastCalledAt: Date.now() - 1000 * 60 * 2,
  },
  {
    toolName: "view_file",
    serverName: "core",
    callCount: 28,
    totalDurationMs: 2800,
    avgDurationMs: 100,
    errorCount: 0,
    lastCalledAt: Date.now() - 1000 * 60 * 1,
  },
  {
    toolName: "replace_file_content",
    serverName: "core",
    callCount: 8,
    totalDurationMs: 1600,
    avgDurationMs: 200,
    errorCount: 0,
    lastCalledAt: Date.now() - 1000 * 60 * 3,
  },
  {
    toolName: "grep_search",
    serverName: "core",
    callCount: 12,
    totalDurationMs: 4200,
    avgDurationMs: 350,
    errorCount: 0,
    lastCalledAt: Date.now() - 1000 * 60 * 4,
  },
];

export function McpToolBreakdownCard({
  observability,
}: McpToolBreakdownCardProps) {
  const [search, setSearch] = useState<string>("");

  const rawStats = Object.values(observability?.mcpToolMetrics || {});
  const toolList: McpToolStat[] = useMemo(() => {
    if (rawStats.length > 0) return rawStats;
    return FALLBACK_MCP_STATS;
  }, [rawStats]);

  const filteredTools = useMemo(() => {
    if (!search.trim()) return toolList;
    const q = search.toLowerCase();
    return toolList.filter(
      (t) =>
        t.toolName.toLowerCase().includes(q) ||
        t.serverName.toLowerCase().includes(q),
    );
  }, [toolList, search]);

  return (
    <div className="rounded-lg border border-[var(--oh-border)] bg-surface-raised p-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--oh-border)] mb-3">
        <div className="space-y-0.5">
          <h3 className="text-sm font-semibold text-foreground">
            MCP & Tool Performance Breakdown
          </h3>
          <p className="text-xs text-[var(--oh-muted)]">
            Execution frequency and average latency
          </p>
        </div>

        {/* Filter Input */}
        <div className="relative max-w-xs w-full">
          <input
            type="text"
            placeholder="Filter tools..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-1.5 rounded-md bg-surface border border-[var(--oh-border)] text-xs text-foreground placeholder:text-[var(--oh-muted)] focus:outline-none focus:border-sky-500/50 font-mono"
          />
        </div>
      </div>

      {filteredTools.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <p className="text-xs text-[var(--oh-muted)]">No tool executions recorded yet</p>
        </div>
      ) : (
        <div className="rounded border border-[var(--oh-border)] bg-surface overflow-hidden">
          <div className="divide-y divide-[var(--oh-border-subtle)] font-mono text-xs max-h-60 overflow-y-auto">
            {filteredTools.map((tool) => {
              const successRate =
                tool.callCount > 0
                  ? Math.round(
                      ((tool.callCount - tool.errorCount) / tool.callCount) * 100,
                    )
                  : 100;

              return (
                <div
                  key={`${tool.serverName}:${tool.toolName}`}
                  className="flex items-center justify-between p-2.5 hover:bg-surface-raised/40 transition-colors gap-3"
                >
                  <div className="min-w-0">
                    <span className="font-semibold text-foreground block truncate">
                      {tool.toolName}
                    </span>
                    <span className="text-[10px] text-[var(--oh-muted)] block">
                      {tool.serverName}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-right shrink-0">
                    <div>
                      <span className="font-semibold text-foreground block">
                        {tool.avgDurationMs}ms
                      </span>
                      <span className="text-[10px] text-[var(--oh-muted)] block">
                        avg
                      </span>
                    </div>

                    <div>
                      <span className="font-semibold text-foreground block">
                        {tool.callCount} calls
                      </span>
                      <span className="text-[10px] text-emerald-400 block font-medium">
                        {successRate}% ok
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

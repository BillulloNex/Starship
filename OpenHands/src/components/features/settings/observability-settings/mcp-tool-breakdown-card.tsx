import React, { useState, useMemo } from "react";
import { Wrench, Search } from "lucide-react";
import { McpToolStat, ObservabilityMetrics } from "#/stores/metrics-store";
import { cn } from "#/utils/utils";

export interface McpToolBreakdownCardProps {
  observability?: ObservabilityMetrics;
}

export function McpToolBreakdownCard({
  observability,
}: McpToolBreakdownCardProps) {
  const [search, setSearch] = useState<string>("");

  const rawStats = Object.values(observability?.mcpToolMetrics || {});

  const toolList: McpToolStat[] = useMemo(() => rawStats, [rawStats]);

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
    <div className="rounded-lg border border-[var(--oh-border)] bg-surface-raised p-4 transition-all">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--oh-border)] mb-3">
        <div className="flex items-center gap-2">
          <Wrench className="size-4 text-amber-400" />
          <h3 className="text-base font-semibold text-foreground">
            MCP & Tool Performance Breakdown
          </h3>
          <span className="text-xs text-[var(--oh-muted)] font-mono">
            ({filteredTools.length} tools)
          </span>
        </div>

        {/* Search */}
        <div className="relative max-w-xs w-full">
          <Search className="absolute left-2.5 top-2 size-3.5 text-[var(--oh-muted)]" />
          <input
            type="text"
            placeholder="Filter tools or server..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-2.5 py-1 rounded bg-surface border border-[var(--oh-border)] text-xs text-foreground placeholder:text-[var(--oh-muted)] focus:outline-none focus:border-amber-500/50"
          />
        </div>
      </div>

      {filteredTools.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Wrench className="size-6 text-[var(--oh-muted)] mb-2" />
          <p className="text-xs text-[var(--oh-muted)]">
            {search.trim()
              ? "No tools match your filter"
              : "No tool executions recorded yet"}
          </p>
          <p className="text-[10px] text-[var(--oh-muted)] mt-1">
            Tool metrics appear as the agent uses tools during a session
          </p>
        </div>
      ) : (
        <div className="rounded border border-[var(--oh-border)] bg-surface overflow-hidden">
          <div className="divide-y divide-[var(--oh-border-subtle)] max-h-72 overflow-y-auto font-mono text-xs custom-scrollbar-always">
            {filteredTools.map((tool) => {
              const successRate =
                tool.callCount > 0
                  ? Math.round(
                      ((tool.callCount - tool.errorCount) / tool.callCount) *
                        100,
                    )
                  : 100;

              return (
                <div
                  key={`${tool.serverName}:${tool.toolName}`}
                  className="flex items-center justify-between p-2.5 hover:bg-surface-raised/40 transition-colors gap-3"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="size-2 rounded-full bg-amber-400 shrink-0" />
                    <div className="min-w-0">
                      <span className="font-semibold text-foreground block truncate">
                        {tool.toolName}
                      </span>
                      <span className="text-[10px] text-[var(--oh-muted)] block">
                        server: {tool.serverName}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-right shrink-0">
                    <div className="flex flex-col">
                      <span className="font-semibold text-foreground">
                        {tool.avgDurationMs}ms
                      </span>
                      <span className="text-[10px] text-[var(--oh-muted)]">
                        avg duration
                      </span>
                    </div>

                    <div className="flex flex-col">
                      <span className="font-semibold text-foreground">
                        {tool.callCount} calls
                      </span>
                      <span
                        className={cn(
                          "text-[10px] font-medium",
                          tool.errorCount > 0
                            ? "text-rose-400"
                            : "text-emerald-400",
                        )}
                      >
                        {successRate}% success
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

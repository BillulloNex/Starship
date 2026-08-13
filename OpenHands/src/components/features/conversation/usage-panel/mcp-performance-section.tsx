import { Wrench } from "lucide-react";
import useMetricsStore from "#/stores/metrics-store";

export function McpPerformanceSection() {
  const mcpMetrics = useMetricsStore(
    (state) => state.observability.mcpToolMetrics,
  );
  const toolList = Object.values(mcpMetrics);

  if (toolList.length === 0) {
    return null;
  }

  return (
    <div className="rounded-md border border-[var(--oh-border)] bg-surface-raised p-3">
      <div className="grid gap-3">
        <div className="flex items-center gap-2 pb-1 border-b border-[var(--oh-border)]">
          <Wrench className="w-4 h-4 text-emerald-500" />
          <span className="text-base font-semibold">MCP Tool Performance</span>
        </div>

        <div className="flex flex-col gap-2">
          {toolList.map((stat) => {
            const successRate =
              stat.callCount > 0
                ? Math.round(
                    ((stat.callCount - stat.errorCount) / stat.callCount) * 100,
                  )
                : 100;

            return (
              <div
                key={`${stat.serverName}:${stat.toolName}`}
                className="flex items-center justify-between p-2 rounded bg-surface border border-[var(--oh-border)] text-xs"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium text-foreground">
                    {stat.toolName}
                  </span>
                  <span className="text-[var(--oh-muted)] text-[10px]">
                    Server: {stat.serverName}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-right">
                  <div className="flex flex-col">
                    <span className="font-mono text-foreground font-semibold">
                      {stat.avgDurationMs} ms
                    </span>
                    <span className="text-[var(--oh-muted)] text-[10px]">
                      Avg Latency
                    </span>
                  </div>

                  <div className="flex flex-col">
                    <span className="font-mono text-foreground">
                      {stat.callCount} calls
                    </span>
                    <span
                      className={`text-[10px] ${
                        stat.errorCount > 0
                          ? "text-red-400"
                          : "text-emerald-400"
                      }`}
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
    </div>
  );
}

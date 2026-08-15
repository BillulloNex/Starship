import React from "react";
import { Sparkles } from "lucide-react";
import { cn } from "#/utils/utils";
import { PerModelMetrics } from "#/stores/metrics-store";

export interface ModelUsageItem {
  id: string;
  name: string;
  provider: string;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  percentage: number;
  color: string;
}

export interface ModelUsageCostCardProps {
  totalCost?: number | null;
  perModelMetrics?: Record<string, PerModelMetrics>;
}

export function ModelUsageCostCard({
  totalCost,
  perModelMetrics,
}: ModelUsageCostCardProps) {
  const isEmpty = !perModelMetrics || Object.keys(perModelMetrics).length === 0;

  let models: ModelUsageItem[] = [];

  if (!isEmpty) {
    const colors = [
      "bg-sky-400",
      "bg-purple-400",
      "bg-amber-400",
      "bg-emerald-400",
      "bg-rose-400",
      "bg-cyan-400",
    ];

    const metricsArray = Object.values(
      perModelMetrics as Record<string, PerModelMetrics>,
    );
    const sortedMetrics = [...metricsArray].sort((a, b) => b.cost - a.cost);

    const grandTotalTokens = sortedMetrics.reduce(
      (sum, m) => sum + m.promptTokens + m.completionTokens,
      0,
    );

    models = sortedMetrics.map((m, index) => {
      const totalTokens = m.promptTokens + m.completionTokens;
      const percentage =
        grandTotalTokens > 0
          ? Math.round((totalTokens / grandTotalTokens) * 100)
          : 0;

      return {
        id: m.usageId,
        name: m.modelName,
        provider: "API Provider",
        tokensIn: m.promptTokens,
        tokensOut: m.completionTokens,
        cost: m.cost,
        percentage,
        color: colors[index % colors.length],
      };
    });
  }

  return (
    <div className="rounded-lg border border-[var(--oh-border)] bg-surface-raised p-4 transition-all">
      <div className="flex items-center justify-between pb-3 border-b border-[var(--oh-border)] mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-sky-400" />
          <h3 className="text-base font-semibold text-foreground">
            Model Usage & Cost Attribution
          </h3>
        </div>
        <span className="text-xs text-[var(--oh-muted)] font-mono">
          Per-Model Token Split
        </span>
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Sparkles className="size-6 text-[var(--oh-muted)] mb-2" />
          <p className="text-xs text-[var(--oh-muted)]">
            No model usage data yet
          </p>
          <p className="text-[10px] text-[var(--oh-muted)] mt-1">
            Start a conversation to see per-model cost attribution
          </p>
        </div>
      ) : (
        <>
          {/* Multi-segment distribution bar */}
          <div className="w-full bg-surface-deep rounded-full h-2.5 overflow-hidden flex border border-[var(--oh-border-subtle)] mb-4">
            {models.map((m) => (
              <div
                key={m.id}
                className={cn("h-full transition-all duration-500", m.color)}
                style={{ width: `${m.percentage}%` }}
                title={`${m.name}: ${m.percentage}%`}
              />
            ))}
          </div>

          {/* Models Grid / List */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {models.map((m) => (
              <div
                key={m.id}
                className="p-3 rounded bg-surface border border-[var(--oh-border)] font-mono text-xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="font-semibold text-foreground truncate">
                      {m.name}
                    </span>
                    <span className="text-[10px] text-[var(--oh-muted)]">
                      {m.percentage}%
                    </span>
                  </div>
                  <span className="text-[10px] text-[var(--oh-muted)] block mb-2">
                    {m.provider}
                  </span>
                </div>

                <div className="pt-2 border-t border-[var(--oh-border-subtle)] flex items-center justify-between">
                  <span className="text-[11px] text-foreground">
                    ${m.cost.toFixed(4)}
                  </span>
                  <span className="text-[10px] text-[var(--oh-muted)]">
                    {((m.tokensIn + m.tokensOut) / 1000).toFixed(1)}k tok
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

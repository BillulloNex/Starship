import React from "react";
import { cn } from "#/utils/utils";
import { PerModelMetrics } from "#/stores/metrics-store";

export interface ModelUsageItem {
  id: string;
  name: string;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  percentage: number;
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
    const metricsArray = Object.values(
      perModelMetrics as Record<string, PerModelMetrics>,
    );
    const sortedMetrics = [...metricsArray].sort((a, b) => b.cost - a.cost);

    const grandTotalTokens = sortedMetrics.reduce(
      (sum, m) => sum + m.promptTokens + m.completionTokens,
      0,
    );

    models = sortedMetrics.map((m) => {
      const totalTokens = m.promptTokens + m.completionTokens;
      const percentage =
        grandTotalTokens > 0
          ? Math.round((totalTokens / grandTotalTokens) * 100)
          : 0;

      return {
        id: m.usageId,
        name: m.modelName,
        tokensIn: m.promptTokens,
        tokensOut: m.completionTokens,
        cost: m.cost,
        percentage,
      };
    });
  }

  return (
    <div className="rounded-lg border border-[var(--oh-border)] bg-surface-raised p-4">
      <div className="flex items-center justify-between pb-3 border-b border-[var(--oh-border)] mb-3">
        <div className="space-y-0.5">
          <h3 className="text-sm font-semibold text-foreground">
            Model Usage & Cost Attribution
          </h3>
          <p className="text-xs text-[var(--oh-muted)]">
            Token distribution per LLM provider
          </p>
        </div>
        <span className="text-xs text-[var(--oh-muted)] font-mono">
          {models.length} model{models.length === 1 ? "" : "s"}
        </span>
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <p className="text-xs text-[var(--oh-muted)]">No model usage data yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Subtle distribution bar */}
          <div className="w-full bg-surface rounded-full h-2 overflow-hidden flex border border-[var(--oh-border)]">
            {models.map((m) => (
              <div
                key={m.id}
                className="h-full bg-sky-400 transition-all duration-500"
                style={{ width: `${Math.max(2, m.percentage)}%` }}
                title={`${m.name}: ${m.percentage}%`}
              />
            ))}
          </div>

          {/* Clean Model List */}
          <div className="divide-y divide-[var(--oh-border-subtle)] border border-[var(--oh-border)] rounded-md bg-surface overflow-hidden font-mono text-xs">
            {models.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between p-2.5 hover:bg-surface-raised/40 transition-colors gap-3"
              >
                <div className="min-w-0">
                  <span className="font-semibold text-foreground block truncate">
                    {m.name}
                  </span>
                  <span className="text-[10px] text-[var(--oh-muted)] block mt-0.5">
                    {m.percentage}% share
                  </span>
                </div>

                <div className="flex items-center gap-4 text-right shrink-0">
                  <div>
                    <span className="font-semibold text-foreground block">
                      ${m.cost.toFixed(4)}
                    </span>
                    <span className="text-[10px] text-[var(--oh-muted)] block">
                      spend
                    </span>
                  </div>

                  <div>
                    <span className="font-semibold text-foreground block">
                      {((m.tokensIn + m.tokensOut) / 1000).toFixed(1)}k
                    </span>
                    <span className="text-[10px] text-[var(--oh-muted)] block">
                      tokens
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

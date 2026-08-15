import React from "react";
import { Sparkles, DollarSign } from "lucide-react";
import { cn } from "#/utils/utils";

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
}

export function ModelUsageCostCard({ totalCost }: ModelUsageCostCardProps) {
  const models: ModelUsageItem[] = [
    {
      id: "gemini-2.5-flash",
      name: "Gemini 2.5 Flash",
      provider: "Google (Primary)",
      tokensIn: 124000,
      tokensOut: 32000,
      cost: totalCost ? totalCost * 0.55 : 0.0185,
      percentage: 65,
      color: "bg-sky-400",
    },
    {
      id: "gemini-2.5-pro",
      name: "Gemini 2.5 Pro",
      provider: "Google (Complex Reasoning)",
      tokensIn: 38000,
      tokensOut: 8500,
      cost: totalCost ? totalCost * 0.30 : 0.0245,
      percentage: 25,
      color: "bg-purple-400",
    },
    {
      id: "claude-3.7-sonnet",
      name: "Claude 3.7 Sonnet",
      provider: "Anthropic / OpenRouter",
      tokensIn: 14000,
      tokensOut: 2400,
      cost: totalCost ? totalCost * 0.15 : 0.012,
      percentage: 10,
      color: "bg-amber-400",
    },
  ];

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
    </div>
  );
}

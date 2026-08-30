/* eslint-disable i18next/no-literal-string */
import { Clock } from "lucide-react";
import type { UnifiedProviderLimit } from "#/api/unified-limits.types";
import { cn } from "#/utils/utils";

function formatTimeRemaining(resetAtSeconds: number | null): string {
  if (!resetAtSeconds) return "";
  const nowSeconds = Math.floor(Date.now() / 1000);
  const diffSeconds = resetAtSeconds - nowSeconds;

  if (diffSeconds <= 0) return "Moments";
  const hours = Math.floor(diffSeconds / 3600);
  const minutes = Math.floor((diffSeconds % 3600) / 60);

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return `${days}d ${remHours}h`;
  }
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function getToneClass(remainingPercent: number): {
  bar: string;
  text: string;
} {
  if (remainingPercent < 15) return { bar: "bg-red-500", text: "text-red-400" };
  if (remainingPercent <= 40)
    return { bar: "bg-amber-500", text: "text-amber-400" };
  return { bar: "bg-emerald-500", text: "text-emerald-400" };
}

function StatusBadge({ status }: { status: UnifiedProviderLimit["status"] }) {
  const badgeStyles: Record<string, string> = {
    available: "bg-emerald-500/15 text-emerald-400",
    limited: "bg-amber-500/15 text-amber-400",
    exhausted: "bg-red-500/15 text-red-400",
    unknown: "bg-zinc-500/15 text-zinc-400",
    error: "bg-red-500/15 text-red-400",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium capitalize",
        badgeStyles[status] ?? badgeStyles.unknown,
      )}
    >
      {status}
    </span>
  );
}

interface FuelGaugeRowProps {
  provider: UnifiedProviderLimit;
}

export function FuelGaugeRow({ provider }: FuelGaugeRowProps) {
  const hasBalance = provider.balance && provider.balance.remaining !== null;
  const hasUsage = Boolean(provider.usage);
  const primaryLimit = provider.limits[0];

  // For balance-based providers, compute percentage from balance
  const balancePercent =
    hasBalance && provider.balance!.limit && provider.balance!.limit > 0
      ? Math.round(
          (provider.balance!.remaining! / provider.balance!.limit) * 100,
        )
      : null;

  const displayPercent =
    primaryLimit?.remainingPercent ?? balancePercent ?? null;
  const tone = displayPercent !== null ? getToneClass(displayPercent) : null;

  const resetAt = primaryLimit?.resetAt ?? null;
  const resetLabel = formatTimeRemaining(resetAt);

  return (
    <div className="flex flex-col gap-1 py-1.5">
      {/* Top row: name + status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-xs sm:text-sm font-medium text-[var(--oh-foreground)] truncate max-w-xs sm:max-w-md">
            {provider.displayName}
          </span>
          {provider.source === "manual" && (
            <span className="text-[9px] text-[var(--oh-muted)] bg-[var(--oh-border)]/30 rounded px-1 py-0.5">
              Manual
            </span>
          )}
          {provider.source === "auto" && provider.category === "gateway" && (
            <span className="text-[9px] text-emerald-400 bg-emerald-500/10 rounded px-1 py-0.5">
              Auto ✓
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {hasBalance ? (
            <span className="text-xs font-semibold text-[var(--oh-foreground)]">
              ${provider.balance!.remaining!.toFixed(2)}
            </span>
          ) : displayPercent !== null ? (
            <span className={cn("text-xs font-semibold", tone?.text)}>
              {displayPercent}% left
            </span>
          ) : hasUsage ? (
            <span className="text-xs font-semibold text-[var(--oh-foreground)]">
              {provider.usage!.totalTokens.toLocaleString()} tokens
            </span>
          ) : null}
          <StatusBadge status={provider.status} />
        </div>
      </div>

      {/* Progress bar */}
      {displayPercent !== null && tone && (
        <div className="relative h-1.5 w-full rounded-full bg-tertiary overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              tone.bar,
            )}
            style={{
              width: `${Math.max(0, Math.min(100, displayPercent))}%`,
            }}
          />
        </div>
      )}

      {/* Reset timer */}
      {resetLabel && (
        <div className="flex items-center justify-end text-[10px] text-[var(--oh-muted)]">
          <Clock className="h-2.5 w-2.5 mr-0.5" />
          {resetLabel}
        </div>
      )}

      {provider.usage && (
        <div className="text-[10px] text-[var(--oh-muted)]">
          {provider.usage.agentCount?.toLocaleString() ?? 0} Cloud agents
          {" · "}
          {provider.usage.runCount?.toLocaleString() ?? 0} runs
          {" · "}
          {provider.usage.inputTokens.toLocaleString()} input
          {" · "}
          {provider.usage.outputTokens.toLocaleString()} output
        </div>
      )}

      {provider.note && (
        <div className="text-[10px] leading-tight text-[var(--oh-muted)]">
          {provider.note}
        </div>
      )}

      {/* Warning for unverified/error providers */}
      {provider.error &&
        (provider.status === "unknown" || provider.status === "error") && (
          <div className="flex items-start gap-1 rounded bg-amber-500/10 border border-amber-500/20 p-1.5 text-[10px] text-amber-400 leading-tight mt-0.5">
            <span className="shrink-0">⚠</span>
            <span>{provider.error}</span>
          </div>
        )}
    </div>
  );
}

/* eslint-disable i18next/no-literal-string */
import { RefreshCw, Fuel } from "lucide-react";
import { useUnifiedLimits } from "#/hooks/query/use-unified-limits";
import { FuelGaugeRow } from "./fuel-gauge-row";
import { ManualCreditInput } from "./manual-credit-input";
import { cn } from "#/utils/utils";

/**
 * Expandable panel showing all provider limits — rendered inside the
 * floating widget's popover.
 */
export function FuelGaugePanel() {
  const { limits, isAnyExhausted, isFetching, refetch } = useUnifiedLimits();

  return (
    <div
      data-testid="fuel-gauge-panel"
      className="w-[300px] max-h-[420px] overflow-y-auto custom-scrollbar rounded-lg border border-[var(--oh-border)] bg-surface-raised shadow-xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--oh-border-subtle)]">
        <div className="flex items-center gap-2">
          <Fuel className="h-4 w-4 text-amber-400" />
          <span className="font-semibold text-sm text-[var(--oh-foreground)]">
            Token Fuel Gauge
          </span>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="cursor-pointer text-[var(--oh-muted)] hover:text-[var(--oh-foreground)] disabled:cursor-default"
          aria-label="Refresh all provider limits"
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", isFetching && "animate-spin")}
          />
        </button>
      </div>

      {/* Provider rows */}
      <div className="px-3 py-1">
        {limits.length > 0 ? (
          <div className="divide-y divide-[var(--oh-border-subtle)]">
            {limits.map((provider) => (
              <FuelGaugeRow key={provider.providerId} provider={provider} />
            ))}
          </div>
        ) : (
          <div className="py-4 text-center text-xs text-[var(--oh-muted)]">
            No providers configured.
            <br />
            Add credentials in Settings or enter manual credits below.
          </div>
        )}

        {/* Exhausted warning */}
        {isAnyExhausted && (
          <div className="flex items-center gap-1.5 rounded bg-red-500/10 border border-red-500/20 p-2 text-[11px] text-red-400 mt-1">
            ⚠ One or more providers are exhausted
          </div>
        )}

        {/* Manual credits section */}
        <ManualCreditInput onUpdate={() => refetch()} />
      </div>
    </div>
  );
}

/* eslint-disable i18next/no-literal-string */
import React from "react";
import { Fuel } from "lucide-react";
import { useUnifiedLimits } from "#/hooks/query/use-unified-limits";
import { useAutoDecrement } from "#/hooks/use-auto-decrement";
import { FuelGaugePanel } from "./fuel-gauge-panel";
import { cn } from "#/utils/utils";

/**
 * Persistent floating gas-gauge button (bottom-right).
 *
 * The coloured ring around the icon reflects the worst provider status:
 *   • Green  = all available
 *   • Amber  = at least one limited
 *   • Red    = at least one exhausted
 *   • Grey   = unknown / no providers
 *
 * Click to toggle an inline panel (flies up from the icon) showing all
 * provider limits and manual credit entries.
 */
export function FuelGaugeWidget() {
  const [open, setOpen] = React.useState(false);
  const { worstStatus, limits } = useUnifiedLimits();
  const ref = React.useRef<HTMLDivElement>(null);

  // Auto-decrement manual credits as conversation cost accumulates
  useAutoDecrement();

  // Close on outside click
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const ringColor: Record<string, string> = {
    available: "ring-emerald-500",
    limited: "ring-amber-500",
    exhausted: "ring-red-500",
    error: "ring-red-500",
    unknown: "ring-zinc-500",
  };

  const iconColor: Record<string, string> = {
    available: "text-emerald-400",
    limited: "text-amber-400",
    exhausted: "text-red-400",
    error: "text-red-400",
    unknown: "text-zinc-400",
  };

  // Don't render anything until we have at least tried to load
  // (avoid a flash of the widget before data arrives)
  const hasAnyData = limits.length > 0;

  return (
    <div
      ref={ref}
      className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2"
      data-testid="fuel-gauge-widget"
    >
      {/* Panel (shown above the button) */}
      {open && (
        <div className="animate-in slide-in-from-bottom-2 fade-in duration-200">
          <FuelGaugePanel />
        </div>
      )}

      {/* Floating button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "relative flex items-center justify-center h-10 w-10 rounded-full",
          "bg-surface-raised border border-[var(--oh-border)]",
          "shadow-lg hover:shadow-xl transition-all",
          "ring-2 ring-offset-1 ring-offset-transparent",
          "cursor-pointer",
          ringColor[worstStatus] ?? ringColor.unknown,
        )}
        aria-label="Toggle fuel gauge"
        aria-expanded={open}
      >
        <Fuel
          className={cn(
            "h-5 w-5",
            iconColor[worstStatus] ?? iconColor.unknown,
          )}
        />
        {/* Notification dot when exhausted */}
        {worstStatus === "exhausted" && (
          <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
        )}
        {/* Badge showing provider count */}
        {hasAnyData && (
          <span className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center h-3.5 min-w-[14px] rounded-full bg-[var(--oh-border)] text-[9px] font-medium text-[var(--oh-foreground)] px-0.5">
            {limits.length}
          </span>
        )}
      </button>
    </div>
  );
}

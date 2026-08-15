import React from "react";
import {
  Activity,
  ArrowUpRight,
  Clock,
  RefreshCw,
  Zap,
} from "lucide-react";
import { cn } from "#/utils/utils";

export interface ObservabilityHeaderProps {
  timeframe: string;
  setTimeframe: (tf: string) => void;
  isFetching: boolean;
  onRefresh: () => void;
  autoRefreshInterval: number | false;
  setAutoRefreshInterval: (interval: number | false) => void;
  site?: string;
  service?: string;
}

const TIMEFRAMES = [
  { value: "15m", label: "15 min" },
  { value: "1h", label: "1 hour" },
  { value: "6h", label: "6 hours" },
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
];

export function ObservabilityHeader({
  timeframe,
  setTimeframe,
  isFetching,
  onRefresh,
  autoRefreshInterval,
  setAutoRefreshInterval,
  site = "us5.datadoghq.com",
  service = "grokbot",
}: ObservabilityHeaderProps) {
  const datadogDashboardUrl = `https://app.${site}/apm/services/${service}`;

  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-raised)] shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center size-10 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <Activity className="size-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-foreground">
              Datadog Observability
            </h3>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live Connected
            </span>
          </div>
          <p className="text-xs text-[var(--oh-muted)]">
            Site: <span className="font-mono">{site}</span> • Service:{" "}
            <span className="font-mono">{service}</span>
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Timeframe selector */}
        <div className="flex items-center rounded-lg border border-[var(--oh-border)] bg-surface p-0.5 text-xs">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.value}
              type="button"
              onClick={() => setTimeframe(tf.value)}
              className={cn(
                "px-2.5 py-1 rounded-md font-medium transition-all",
                timeframe === tf.value
                  ? "bg-[var(--oh-surface-raised)] text-white shadow-sm"
                  : "text-[var(--oh-muted)] hover:text-foreground",
              )}
            >
              {tf.label}
            </button>
          ))}
        </div>

        {/* Auto-refresh toggle */}
        <button
          type="button"
          onClick={() =>
            setAutoRefreshInterval(
              autoRefreshInterval === false
                ? 15_000
                : autoRefreshInterval === 15_000
                  ? 30_000
                  : false,
            )
          }
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all",
            autoRefreshInterval !== false
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-[var(--oh-border)] bg-surface text-[var(--oh-muted)] hover:text-foreground",
          )}
          title="Toggle auto-refresh interval (15s / 30s / Off)"
        >
          <Clock className="size-3.5" />
          <span>
            {autoRefreshInterval === false
              ? "Auto: Off"
              : `Auto: ${autoRefreshInterval / 1000}s`}
          </span>
        </button>

        {/* Refresh button */}
        <button
          type="button"
          onClick={onRefresh}
          disabled={isFetching}
          className="flex items-center justify-center p-1.5 rounded-lg border border-[var(--oh-border)] bg-surface text-[var(--oh-muted)] hover:text-foreground hover:bg-[var(--oh-surface-raised)] transition-all disabled:opacity-50"
          title="Refresh Data"
        >
          <RefreshCw
            className={cn("size-3.5", isFetching && "animate-spin text-sky-400")}
          />
        </button>

        {/* Deep link to Datadog web console */}
        <a
          href={datadogDashboardUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/30 text-xs font-medium transition-all"
        >
          <span>Open in Datadog</span>
          <ArrowUpRight className="size-3.5" />
        </a>
      </div>
    </div>
  );
}

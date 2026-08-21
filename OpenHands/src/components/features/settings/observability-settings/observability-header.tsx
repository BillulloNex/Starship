import React from "react";
import {
  Activity,
  ArrowUpRight,
  Clock,
  RefreshCw,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { cn } from "#/utils/utils";
import {
  isLangfuseEnabled,
  getLangfuseBaseUrl,
} from "#/services/langfuse-service";

function isPostHogAiEnabled(): boolean {
  return import.meta.env.VITE_POSTHOG_AI_ENABLED !== "false";
}

function isOpikEnabled(): boolean {
  return Boolean(import.meta.env.VITE_OPIK_API_KEY);
}

function isLangwatchEnabled(): boolean {
  return Boolean(import.meta.env.VITE_LANGWATCH_API_KEY);
}

function isRaindropEnabled(): boolean {
  return Boolean(
    import.meta.env.VITE_RAINDROP_WRITE_KEY ||
      import.meta.env.RAINDROP_WRITE_KEY,
  );
}


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
  { value: "15m", label: "15m" },
  { value: "1h", label: "1h" },
  { value: "6h", label: "6h" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
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
  const langfuseBaseUrl = getLangfuseBaseUrl();

  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3.5 rounded-lg border border-[var(--oh-border)] bg-surface-raised">
      {/* Title & Dual Telemetry Badges */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center size-9 rounded-lg bg-surface border border-[var(--oh-border)] text-emerald-400">
          <Activity className="size-4" />
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-semibold text-foreground">
              Agent Observability Cockpit
            </h2>
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-900/40 text-emerald-300 border border-emerald-700/40">
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Datadog Connected
              </span>
              {isLangfuseEnabled() && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-sky-900/40 text-sky-300 border border-sky-700/40">
                  <Sparkles className="size-2.5 text-sky-400" />
                  Langfuse Traced
                </span>
              )}
              {isPostHogAiEnabled() && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-900/40 text-orange-300 border border-orange-700/40">
                  <span className="size-1.5 rounded-full bg-orange-400" />
                  PostHog AI
                </span>
              )}
              {isOpikEnabled() && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-900/40 text-blue-300 border border-blue-700/40">
                  <span className="size-1.5 rounded-full bg-blue-400" />
                  Opik
                </span>
              )}
              {isLangwatchEnabled() && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-teal-900/40 text-teal-300 border border-teal-700/40">
                  <span className="size-1.5 rounded-full bg-teal-400" />
                  Langwatch
                </span>
              )}
              {isRaindropEnabled() && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-900/40 text-indigo-300 border border-indigo-700/40">
                  <span className="size-1.5 rounded-full bg-indigo-400" />
                  Raindrop
                </span>
              )}
            </div>
          </div>
          <p className="text-xs text-[var(--oh-muted)] mt-0.5">
            Service:{" "}
            <span className="font-mono text-foreground">{service}</span> • Site:{" "}
            <span className="font-mono text-foreground">{site}</span>
          </p>
        </div>
      </div>

      {/* Controls & Deep Links */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Timeframe selector */}
        <div className="flex items-center rounded-md border border-[var(--oh-border)] bg-surface p-0.5 text-xs font-mono">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.value}
              type="button"
              onClick={() => setTimeframe(tf.value)}
              className={cn(
                "px-2.5 py-1 rounded font-medium transition-colors",
                timeframe === tf.value
                  ? "bg-surface-raised text-foreground shadow-sm"
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
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-medium transition-colors font-mono",
            autoRefreshInterval !== false
              ? "border-emerald-700/50 bg-emerald-900/40 text-emerald-300"
              : "border-[var(--oh-border)] bg-surface text-[var(--oh-muted)] hover:text-foreground",
          )}
          title="Toggle auto-refresh interval (15s / 30s / Off)"
        >
          <Clock className="size-3.5" />
          <span>
            {autoRefreshInterval === false
              ? "Off"
              : `${autoRefreshInterval / 1000}s`}
          </span>
        </button>

        {/* Refresh button */}
        <button
          type="button"
          onClick={onRefresh}
          disabled={isFetching}
          className="flex items-center justify-center p-1.5 rounded-md border border-[var(--oh-border)] bg-surface text-[var(--oh-muted)] hover:text-foreground hover:bg-surface-raised transition-colors disabled:opacity-50"
          title="Refresh Metrics"
        >
          <RefreshCw
            className={cn(
              "size-3.5",
              isFetching && "animate-spin text-sky-400",
            )}
          />
        </button>

        {/* Deep link buttons */}
        {isLangfuseEnabled() && langfuseBaseUrl && (
          <a
            href={`${langfuseBaseUrl}/project`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-sky-950/40 hover:bg-sky-900/50 text-sky-300 border border-sky-800/40 text-xs font-medium transition-colors"
          >
            <span>Langfuse</span>
            <ExternalLink className="size-3" />
          </a>
        )}
        {isOpikEnabled() && (
          <a
            href="https://www.comet.com/opik/projects"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-blue-950/40 hover:bg-blue-900/50 text-blue-300 border border-blue-800/40 text-xs font-medium transition-colors"
          >
            <span>Opik</span>
            <ExternalLink className="size-3" />
          </a>
        )}
        {isLangwatchEnabled() && (
          <a
            href={`${import.meta.env.VITE_LANGWATCH_BASE_URL || "https://app.langwatch.ai"}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-teal-950/40 hover:bg-teal-900/50 text-teal-300 border border-teal-800/40 text-xs font-medium transition-colors"
          >
            <span>Langwatch</span>
            <ExternalLink className="size-3" />
          </a>
        )}
        {isRaindropEnabled() && (
          <a
            href="https://app.raindrop.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-indigo-950/40 hover:bg-indigo-900/50 text-indigo-300 border border-indigo-800/40 text-xs font-medium transition-colors"
          >
            <span>Raindrop</span>
            <ExternalLink className="size-3" />
          </a>
        )}

        <a
          href={datadogDashboardUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-purple-950/40 hover:bg-purple-900/50 text-purple-300 border border-purple-800/40 text-xs font-medium transition-colors"
        >
          <span>Datadog</span>
          <ArrowUpRight className="size-3.5" />
        </a>
      </div>
    </div>
  );
}

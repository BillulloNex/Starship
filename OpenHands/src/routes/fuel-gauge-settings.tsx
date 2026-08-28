/* eslint-disable i18next/no-literal-string */
import React from "react";
import { useTranslation } from "react-i18next";
import { Fuel, RefreshCw, AlertTriangle, CheckCircle2, AlertCircle, HelpCircle, Info } from "lucide-react";
import { useUnifiedLimits } from "#/hooks/query/use-unified-limits";
import { FuelGaugeRow } from "#/components/features/fuel-gauge/fuel-gauge-row";
import { ManualCreditInput } from "#/components/features/fuel-gauge/manual-credit-input";
import { Typography } from "#/ui/typography";
import { cn } from "#/utils/utils";

export default function FuelGaugeSettingsScreen() {
  const { t: _t } = useTranslation("openhands");
  const { limits, worstStatus, isAnyExhausted, isFetching, refetch } = useUnifiedLimits();

  const statusConfig = {
    available: {
      label: "All Systems Available",
      color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
      icon: CheckCircle2,
    },
    limited: {
      label: "Rate Limited / Throttled",
      color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
      icon: AlertTriangle,
    },
    exhausted: {
      label: "Quota Exhausted",
      color: "text-red-400 bg-red-500/10 border-red-500/20",
      icon: AlertCircle,
    },
    error: {
      label: "Provider Error",
      color: "text-red-400 bg-red-500/10 border-red-500/20",
      icon: AlertCircle,
    },
    unknown: {
      label: "Status Pending / Unchecked",
      color: "text-zinc-400 bg-zinc-500/10 border-zinc-500/20",
      icon: HelpCircle,
    },
  }[worstStatus] ?? {
    label: "Unknown",
    color: "text-zinc-400 bg-zinc-500/10 border-zinc-500/20",
    icon: HelpCircle,
  };

  const StatusIcon = statusConfig.icon;

  return (
    <div data-testid="fuel-gauge-settings-screen" className="flex flex-col gap-6 max-w-4xl">
      {/* Overview Status Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-[var(--oh-border)] bg-surface-raised shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-400">
            <Fuel className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <Typography.H3 className="text-base font-semibold text-[var(--oh-foreground)]">
                Token & Rate Limit Status
              </Typography.H3>
              <span className={cn("inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border", statusConfig.color)}>
                <StatusIcon className="h-3.5 w-3.5" />
                {statusConfig.label}
              </span>
            </div>
            <p className="text-xs text-[var(--oh-muted)] mt-0.5">
              Live quota, rate-limit meters, and automated cost tracking across all AI providers.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className={cn(
            "flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium",
            "border border-[var(--oh-border)] bg-surface-base text-[var(--oh-foreground)]",
            "hover:bg-[var(--oh-border)]/20 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
          <span>{isFetching ? "Refreshing..." : "Refresh Quotas"}</span>
        </button>
      </div>

      {/* Exhausted Alert */}
      {isAnyExhausted && (
        <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">One or more providers have exhausted their quota.</span>
            <p className="mt-0.5 text-red-400/90">
              Check your provider billing dashboard or switch active models in LLM settings.
            </p>
          </div>
        </div>
      )}

      {/* Provider Limits Section */}
      <section className="flex flex-col gap-3 p-5 rounded-xl border border-[var(--oh-border)] bg-surface-raised shadow-xs">
        <div className="flex items-center justify-between border-b border-[var(--oh-border-subtle)] pb-3">
          <div>
            <Typography.H4 className="text-sm font-semibold text-[var(--oh-foreground)]">
              Connected Providers & Quotas
            </Typography.H4>
            <p className="text-xs text-[var(--oh-muted)] mt-0.5">
              Real-time rate limits, reset timers, and balances detected from active services.
            </p>
          </div>
          <span className="text-xs font-medium text-[var(--oh-muted)]">
            {limits.length} {limits.length === 1 ? "provider" : "providers"} tracked
          </span>
        </div>

        <div className="pt-1">
          {limits.length > 0 ? (
            <div className="divide-y divide-[var(--oh-border-subtle)]">
              {limits.map((provider) => (
                <div key={provider.providerId} className="py-2.5 first:pt-1 last:pb-1">
                  <FuelGaugeRow provider={provider} />
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-[var(--oh-muted)]">
              No live quota providers currently detected.
              <br />
              Configured API keys will automatically appear as quota telemetry is polled.
            </div>
          )}
        </div>
      </section>

      {/* Manual Credits Section */}
      <section className="flex flex-col gap-3 p-5 rounded-xl border border-[var(--oh-border)] bg-surface-raised shadow-xs">
        <div className="border-b border-[var(--oh-border-subtle)] pb-3">
          <Typography.H4 className="text-sm font-semibold text-[var(--oh-foreground)]">
            Manual Prepaid Credits
          </Typography.H4>
          <p className="text-xs text-[var(--oh-muted)] mt-0.5">
            Add pay-as-you-go balance pools (e.g. OpenAI, Anthropic, OpenRouter, DeepSeek). Grokbot automatically tracks and decrements balance as conversation tokens accumulate.
          </p>
        </div>

        <div className="pt-1">
          <ManualCreditInput onUpdate={() => refetch()} />
        </div>
      </section>

      {/* Info Card */}
      <div className="flex items-start gap-2.5 p-4 rounded-xl bg-surface-base border border-[var(--oh-border-subtle)] text-xs text-[var(--oh-muted)]">
        <Info className="h-4 w-4 text-[var(--oh-muted)] shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-semibold text-[var(--oh-foreground)]">How Auto-Decrement Works</span>
          <p>
            When conversations run, token usage and cost metrics are observed in the background to decrement your estimated remaining credits in real time. Updating manual credit entries recalibrates any estimation drift.
          </p>
        </div>
      </div>
    </div>
  );
}

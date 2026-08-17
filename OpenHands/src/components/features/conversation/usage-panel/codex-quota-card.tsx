import React from "react";
import { Bot, RefreshCw, AlertTriangle, Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { useCodexUsage } from "#/hooks/query/use-codex-usage";
import { CodexRateLimitWindow } from "#/api/codex-usage-service.types";
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
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function getQuotaToneClass(remainingPercent: number): {
  bar: string;
  text: string;
} {
  if (remainingPercent < 15) {
    return {
      bar: "bg-red-500",
      text: "text-red-500",
    };
  }
  if (remainingPercent <= 40) {
    return {
      bar: "bg-amber-500",
      text: "text-amber-500",
    };
  }
  return {
    bar: "bg-emerald-500",
    text: "text-emerald-500",
  };
}

interface WindowMeterProps {
  label: string;
  windowData: CodexRateLimitWindow;
}

function WindowMeter({ label, windowData }: WindowMeterProps) {
  const { t } = useTranslation("openhands");
  const tone = getQuotaToneClass(windowData.remainingPercent);
  const resetLabel = formatTimeRemaining(windowData.resetAt);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-[var(--oh-foreground)]">{label}</span>
        <span className={cn("font-semibold", tone.text)}>
          {windowData.remainingPercent}% {t(I18nKey.CONVERSATION$LEFT)}
        </span>
      </div>

      <div className="relative h-2 w-full rounded-full bg-tertiary overflow-hidden">
        <div
          data-testid="codex-quota-meter-bar"
          className={cn("h-full rounded-full transition-all duration-500", tone.bar)}
          style={{ width: `${Math.max(0, Math.min(100, windowData.remainingPercent))}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-[11px] text-[var(--oh-muted)]">
        <span>{windowData.usedPercent}% used</span>
        {resetLabel && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3 inline" /> {resetLabel}
          </span>
        )}
      </div>
    </div>
  );
}

export function CodexQuotaCard() {
  const { t } = useTranslation("openhands");
  const { data: quota, isLoading, isFetching, refetch } = useCodexUsage();

  if (!quota) {
    return null;
  }

  const isLimitReached = Boolean(
    quota.primaryWindow?.limitReached || quota.secondaryWindow?.limitReached,
  );

  const planName =
    quota.planType === "pro"
      ? "ChatGPT Pro"
      : quota.planType === "team"
        ? "ChatGPT Team"
        : quota.planType === "plus"
          ? "ChatGPT Plus"
          : "ChatGPT Plan";

  return (
    <div
      data-testid="codex-quota-card"
      className="rounded-md border border-[var(--oh-border)] bg-surface-raised p-3 flex flex-col gap-3"
    >
      <div className="flex items-center justify-between pb-1 border-b border-[var(--oh-border-subtle)]">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-[var(--oh-primary,#6366f1)]" />
          <span className="font-semibold text-sm">
            {t(I18nKey.CONVERSATION$CODEX_QUOTA)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded bg-surface-base px-2 py-0.5 text-xs font-medium text-[var(--oh-muted)] border border-[var(--oh-border)]">
            {planName}
          </span>
          <button
            type="button"
            data-testid="codex-quota-refresh"
            onClick={() => refetch()}
            disabled={isLoading || isFetching}
            className="cursor-pointer text-[var(--oh-muted)] hover:text-[var(--oh-foreground)] disabled:cursor-default"
            aria-label={t(I18nKey.BUTTON$REFRESH)}
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", isFetching && "animate-spin")}
            />
          </button>
        </div>
      </div>

      {isLimitReached && (
        <div className="flex items-center gap-2 rounded bg-red-500/10 border border-red-500/20 p-2 text-xs text-red-500">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{t(I18nKey.CONVERSATION$LIMIT_REACHED)}</span>
        </div>
      )}

      <div className="grid gap-3">
        {quota.primaryWindow && (
          <WindowMeter
            label={t(I18nKey.CONVERSATION$SESSION_LIMIT_5H)}
            windowData={quota.primaryWindow}
          />
        )}
        {quota.secondaryWindow && (
          <WindowMeter
            label={t(I18nKey.CONVERSATION$WEEKLY_LIMIT)}
            windowData={quota.secondaryWindow}
          />
        )}
        {!quota.primaryWindow && !quota.secondaryWindow && (
          <div className="text-xs text-emerald-500 font-medium py-0.5">
            Active • 100% available
          </div>
        )}
      </div>
    </div>
  );
}

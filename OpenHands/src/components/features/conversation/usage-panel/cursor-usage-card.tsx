/* eslint-disable i18next/no-literal-string */
import { Database, Layers, RefreshCw } from "lucide-react";
import type { MetricsState } from "#/stores/metrics-store";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useCursorUsage } from "#/hooks/query/use-cursor-usage";
import { AgentBrandIcon } from "#/components/shared/agent-brand-icon";
import { formatCompactTokenCount } from "#/utils/format-token-count";
import { cn } from "#/utils/utils";

interface CursorUsageCardProps {
  currentUsage: MetricsState["usage"];
}

export function CursorUsageCard({ currentUsage }: CursorUsageCardProps) {
  const { data: conversation } = useActiveConversation();
  const provider =
    conversation?.acp_server ?? conversation?.tags?.acpserver ?? null;
  const isCursor = conversation?.agent_kind === "acp" && provider === "cursor";
  const {
    data: accountUsage,
    isLoading,
    isFetching,
    refetch,
  } = useCursorUsage(isCursor);

  if (!isCursor) return null;

  const currentInput = currentUsage?.prompt_tokens ?? 0;
  const currentOutput = currentUsage?.completion_tokens ?? 0;
  const currentCacheRead = currentUsage?.cache_read_tokens ?? 0;
  const currentCacheWrite = currentUsage?.cache_write_tokens ?? 0;
  const currentTotal =
    currentInput + currentOutput + currentCacheRead + currentCacheWrite;
  const accountTotal = accountUsage?.totalUsage.totalTokens ?? 0;

  return (
    <div
      data-testid="cursor-usage-card"
      className="rounded-md border border-[var(--oh-border)] bg-surface-raised p-3 flex flex-col gap-3"
    >
      <div className="flex items-center justify-between pb-1 border-b border-[var(--oh-border-subtle)]">
        <div className="flex items-center gap-2">
          <AgentBrandIcon kind="cursor" size={16} />
          <span className="font-semibold text-sm">Cursor usage</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded bg-surface-base px-2 py-0.5 text-xs font-medium text-[var(--oh-muted)] border border-[var(--oh-border)]">
            API key
          </span>
          <button
            type="button"
            data-testid="cursor-usage-refresh"
            onClick={() => refetch()}
            disabled={isLoading || isFetching}
            className="cursor-pointer text-[var(--oh-muted)] hover:text-[var(--oh-foreground)] disabled:cursor-default"
            aria-label="Refresh Cursor usage"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", isFetching && "animate-spin")}
            />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col rounded bg-surface-base border border-[var(--oh-border)] p-2">
          <div className="flex items-center gap-1 text-[11px] text-[var(--oh-muted)]">
            <Layers className="size-3 text-violet-400" />
            <span>This conversation</span>
          </div>
          <span className="mt-1 text-sm font-semibold text-violet-300">
            {formatCompactTokenCount(currentTotal)}
          </span>
          <span className="text-[10px] text-[var(--oh-muted)] mt-0.5">
            {formatCompactTokenCount(currentInput)} in ·{" "}
            {formatCompactTokenCount(currentOutput)} out
          </span>
        </div>

        <div className="flex flex-col rounded bg-surface-base border border-[var(--oh-border)] p-2">
          <div className="flex items-center gap-1 text-[11px] text-[var(--oh-muted)]">
            <Database className="size-3 text-sky-400" />
            <span>Cloud Agents</span>
          </div>
          <span className="mt-1 text-sm font-semibold text-sky-300">
            {formatCompactTokenCount(accountTotal)}
          </span>
          <span className="text-[10px] text-[var(--oh-muted)] mt-0.5">
            {accountUsage
              ? `${accountUsage.agentCount.toLocaleString()} agents · ${accountUsage.runCount.toLocaleString()} runs`
              : isLoading || isFetching
                ? "Loading usage…"
                : "No Cloud Agent usage found"}
          </span>
        </div>
      </div>

      {accountUsage && (
        <div className="text-[10px] text-[var(--oh-muted)]">
          Cloud totals: {accountUsage.totalUsage.inputTokens.toLocaleString()}{" "}
          input
          {" · "}
          {accountUsage.totalUsage.outputTokens.toLocaleString()} output
          {" · "}
          {accountUsage.totalUsage.cacheReadTokens.toLocaleString()} cache read
          {" · "}
          {accountUsage.totalUsage.cacheWriteTokens.toLocaleString()} cache
          write
        </div>
      )}

      <div className="rounded bg-surface-base border border-[var(--oh-border)] p-2 text-[10px] leading-tight text-[var(--oh-muted)]">
        Cursor reports token totals for API-created Cloud Agents. Its user API
        does not expose remaining plan allowance or reset time.
      </div>
    </div>
  );
}

import React from "react";
import { Sparkles, Zap, ShieldCheck, Database, Layers } from "lucide-react";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useLiveConversationMetrics } from "#/hooks/use-live-conversation-metrics";
import { formatCompactTokenCount } from "#/utils/format-token-count";
import { cn } from "#/utils/utils";

export function ClaudeUsageCard() {
  const { data: conversation } = useActiveConversation();
  const metrics = useLiveConversationMetrics();
  const { usage } = metrics;

  const isAcpClaude =
    conversation?.agent_kind === "acp" &&
    (conversation?.acp_server === "claude-code" ||
      conversation?.tags?.acpserver === "claude-code");

  const isClaudeModel =
    typeof conversation?.llm_model === "string" &&
    conversation.llm_model.toLowerCase().includes("claude");

  // Only render when the conversation is Claude-powered
  if (!isAcpClaude && !isClaudeModel) {
    return null;
  }

  const promptTokens = usage?.prompt_tokens ?? 0;
  const completionTokens = usage?.completion_tokens ?? 0;
  const cacheReadTokens = usage?.cache_read_tokens ?? 0;
  const cacheWriteTokens = usage?.cache_write_tokens ?? 0;
  const totalTokens = promptTokens + completionTokens;

  // Context window calculation (default 200k for modern Claude models)
  const contextWindow = usage?.context_window || 200000;
  const currentTokens = usage?.per_turn_token || totalTokens;
  const contextPercentage = Math.min(
    100,
    Math.round((currentTokens / contextWindow) * 100),
  );

  // Cache efficiency calculation
  const totalInputCandidate = promptTokens + cacheReadTokens;
  const cacheHitRatio =
    totalInputCandidate > 0
      ? Math.round((cacheReadTokens / totalInputCandidate) * 100)
      : 0;

  const contextTone =
    contextPercentage > 85
      ? "text-red-400 bg-red-500"
      : contextPercentage > 60
        ? "text-amber-400 bg-amber-500"
        : "text-emerald-400 bg-emerald-500";

  return (
    <div
      data-testid="claude-usage-card"
      className="rounded-md border border-[var(--oh-border)] bg-surface-raised p-3 flex flex-col gap-3"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-1 border-b border-[var(--oh-border-subtle)]">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-orange-400" />
          <span className="font-semibold text-sm">Claude Code Status</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded bg-surface-base px-2 py-0.5 text-xs font-medium text-orange-300 border border-[var(--oh-border)]">
            <Zap className="size-3 text-orange-400" />
            {isAcpClaude ? "Claude Subscription" : "Claude Model"}
          </span>
          <span className="inline-flex items-center gap-1 rounded bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-300 border border-orange-500/20">
            <ShieldCheck className="size-3 text-orange-400" />
            YOLO Active
          </span>
        </div>
      </div>

      {/* Context Window Meter */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-[var(--oh-foreground)]">
            Context Window (200k)
          </span>
          <span className={cn("font-semibold", contextTone.split(" ")[0])}>
            {contextPercentage}% used ({formatCompactTokenCount(currentTokens)})
          </span>
        </div>

        <div className="relative h-2 w-full rounded-full bg-tertiary overflow-hidden">
          <div
            data-testid="claude-context-meter-bar"
            className={cn(
              "h-full rounded-full transition-all duration-500",
              contextTone.split(" ")[1],
            )}
            style={{ width: `${Math.max(0, contextPercentage)}%` }}
          />
        </div>
      </div>

      {/* Metric Breakdown Grid */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        {/* Cache Savings */}
        <div className="flex flex-col rounded bg-surface-base border border-[var(--oh-border)] p-2">
          <div className="flex items-center gap-1 text-[11px] text-[var(--oh-muted)]">
            <Database className="size-3 text-sky-400" />
            <span>Prompt Cache</span>
          </div>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-sm font-semibold text-sky-300">
              {cacheHitRatio}%
            </span>
            <span className="text-[10px] text-[var(--oh-muted)]">hits</span>
          </div>
          <span className="text-[10px] text-emerald-400 mt-0.5">
            {formatCompactTokenCount(cacheReadTokens)} read (90% off)
          </span>
        </div>

        {/* Total Usage */}
        <div className="flex flex-col rounded bg-surface-base border border-[var(--oh-border)] p-2">
          <div className="flex items-center gap-1 text-[11px] text-[var(--oh-muted)]">
            <Layers className="size-3 text-purple-400" />
            <span>Tokens Generated</span>
          </div>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-sm font-semibold text-purple-300">
              {formatCompactTokenCount(completionTokens)}
            </span>
            <span className="text-[10px] text-[var(--oh-muted)]">out</span>
          </div>
          <span className="text-[10px] text-[var(--oh-muted)] mt-0.5">
            {formatCompactTokenCount(promptTokens)} input tokens
          </span>
        </div>
      </div>
    </div>
  );
}

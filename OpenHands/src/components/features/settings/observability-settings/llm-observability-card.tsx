import React from "react";
import {
  Bot,
  Sparkles,
  DollarSign,
  ArrowUpRight,
  ShieldCheck,
} from "lucide-react";

export interface LlmObservabilityCardProps {
  site?: string;
}

export function LlmObservabilityCard({
  site = "us5.datadoghq.com",
}: LlmObservabilityCardProps) {
  const llmObsUrl = `https://app.${site}/llm/apps/grokbot`;

  return (
    <div className="rounded-md border border-[var(--oh-border)] bg-surface-raised p-3">
      <div className="flex items-center justify-between pb-2 border-b border-[var(--oh-border)] mb-3">
        <div className="flex items-center gap-2">
          <Bot className="size-4 text-emerald-400" />
          <span className="text-base font-semibold text-foreground">
            LLM Observability & Tracing
          </span>
        </div>
        <a
          href={llmObsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 font-medium"
        >
          <span>LLM Obs Console</span>
          <ArrowUpRight className="size-3" />
        </a>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        <div className="p-3 rounded bg-surface border border-[var(--oh-border)]">
          <div className="flex items-center justify-between text-xs text-[var(--oh-muted)] mb-1">
            <span>LLM Tracing Mode</span>
            <Sparkles className="size-3.5 text-emerald-400" />
          </div>
          <div className="text-sm font-semibold text-foreground">
            Full-Stack Tracing
          </div>
          <p className="text-[11px] text-[var(--oh-muted)] mt-1">
            LiteLLM + ddtrace-run (dual-traced with Langfuse)
          </p>
        </div>

        <div className="p-3 rounded bg-surface border border-[var(--oh-border)]">
          <div className="flex items-center justify-between text-xs text-[var(--oh-muted)] mb-1">
            <span>Hallucination & Security</span>
            <ShieldCheck className="size-3.5 text-amber-400" />
          </div>
          <div className="text-sm font-semibold text-emerald-300 flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            <span>Active & Guarded</span>
          </div>
          <p className="text-[11px] text-[var(--oh-muted)] mt-1">
            Prompt injection & CVE inspection enabled
          </p>
        </div>

        <div className="p-3 rounded bg-surface border border-[var(--oh-border)]">
          <div className="flex items-center justify-between text-xs text-[var(--oh-muted)] mb-1">
            <span>Cost & Latency Attribution</span>
            <DollarSign className="size-3.5 text-sky-400" />
          </div>
          <div className="text-sm font-semibold text-foreground">
            Per-turn Token Tracking
          </div>
          <p className="text-[11px] text-[var(--oh-muted)] mt-1">
            Auto-correlated with APM trace spans
          </p>
        </div>
      </div>

      <div className="p-2.5 rounded bg-surface border border-[var(--oh-border)] text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[var(--oh-muted)]">
        <span>
          💡 Every agent turn, tool execution (bash/browser/files), and LLM
          generation is indexed in Datadog.
        </span>
        <a
          href={llmObsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-sky-400 hover:text-sky-300 font-medium underline"
        >
          View Model Runs & Traces →
        </a>
      </div>
    </div>
  );
}

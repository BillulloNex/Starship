import { ExternalLink, Activity, Clock } from "lucide-react";
import useMetricsStore from "#/stores/metrics-store";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import {
  getLangfuseBaseUrl,
  isLangfuseEnabled,
  getLangfuseSessionUrl,
} from "#/services/langfuse-service";

export function ObservabilityLangfuseCard() {
  const observability = useMetricsStore((state) => state.observability);
  const { data: conversation } = useActiveConversation();
  const conversationId = conversation?.id;

  const enabled = isLangfuseEnabled();
  const baseUrl = getLangfuseBaseUrl();

  const sessionUrl = conversationId
    ? getLangfuseSessionUrl(conversationId)
    : `${baseUrl}/project`;

  return (
    <div className="rounded-md border border-[var(--oh-border)] bg-surface-raised p-3">
      <div className="grid gap-3">
        <div className="flex items-center justify-between pb-1 border-b border-[var(--oh-border)]">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-sky-400" />
            <span className="text-base font-semibold">
              Observability & Timing
            </span>
          </div>
          {enabled && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-900/50 text-emerald-300 border border-emerald-700/50">
              Langfuse Connected
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex flex-col p-2 rounded bg-surface border border-[var(--oh-border)]">
            <div className="flex items-center gap-1 text-[var(--oh-muted)] mb-1">
              <Clock className="w-3 h-3" />
              <span>Last Response Latency</span>
            </div>
            <span className="font-mono text-sm font-semibold text-foreground">
              {observability.lastTurnDurationMs !== null
                ? `${(observability.lastTurnDurationMs / 1000).toFixed(2)}s`
                : "—"}
            </span>
          </div>

          <div className="flex flex-col p-2 rounded bg-surface border border-[var(--oh-border)]">
            <div className="flex items-center gap-1 text-[var(--oh-muted)] mb-1">
              <Clock className="w-3 h-3" />
              <span>Avg Latency / Turn</span>
            </div>
            <span className="font-mono text-sm font-semibold text-foreground">
              {observability.avgTurnDurationMs !== null
                ? `${(observability.avgTurnDurationMs / 1000).toFixed(2)}s`
                : "—"}
            </span>
          </div>
        </div>

        {enabled && (
          <a
            href={sessionUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-1.5 px-3 mt-1 rounded bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/30 text-xs font-medium transition-colors"
          >
            <span>View Traces on Langfuse</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </div>
  );
}

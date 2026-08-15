import React from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  HelpCircle,
  Shield,
} from "lucide-react";
import { DatadogMonitorItem } from "#/api/observability-service/datadog.types";
import { cn } from "#/utils/utils";

export interface MonitorsAlertsCardProps {
  monitors: DatadogMonitorItem[];
  isLoading?: boolean;
  site?: string;
}

export function MonitorsAlertsCard({
  monitors,
  isLoading,
  site = "us5.datadoghq.com",
}: MonitorsAlertsCardProps) {
  const getMonitorStateBadge = (state: string) => {
    const s = (state || "").toLowerCase();
    if (s === "alert") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30">
          <AlertCircle className="size-3" />
          Alert
        </span>
      );
    }
    if (s === "warn" || s === "warning") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
          <AlertTriangle className="size-3" />
          Warning
        </span>
      );
    }
    if (s === "ok") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
          <CheckCircle2 className="size-3" />
          OK
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-500/15 text-slate-300 border border-slate-500/30">
        <HelpCircle className="size-3" />
        No Data
      </span>
    );
  };

  const okCount = monitors.filter((m) => (m.state || "").toLowerCase() === "ok").length;
  const alertCount = monitors.filter((m) => (m.state || "").toLowerCase() === "alert").length;
  const warnCount = monitors.filter((m) => (m.state || "").toLowerCase() === "warn" || (m.state || "").toLowerCase() === "warning").length;
  const noDataCount = monitors.length - (okCount + alertCount + warnCount);

  return (
    <div className="rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-raised)] p-4 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--oh-border)] mb-4">
        <div className="flex items-center gap-2">
          <Shield className="size-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-foreground">
            Monitors & Alerting Posture
          </h3>
          <span className="text-xs text-[var(--oh-muted)]">
            ({monitors.length} configured monitors)
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-medium">
            {okCount} OK
          </span>
          {warnCount > 0 && (
            <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-medium">
              {warnCount} Warn
            </span>
          )}
          {alertCount > 0 && (
            <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20 font-medium">
              {alertCount} Alert
            </span>
          )}
          {noDataCount > 0 && (
            <span className="px-2 py-0.5 rounded bg-slate-500/10 text-slate-300 border border-slate-500/20 font-medium">
              {noDataCount} No Data
            </span>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-[var(--oh-border)] bg-surface overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-[var(--oh-muted)]">
            Loading monitors from Datadog...
          </div>
        ) : monitors.length === 0 ? (
          <div className="p-8 text-center text-xs text-[var(--oh-muted)]">
            No monitors configured yet in Datadog.
          </div>
        ) : (
          <div className="divide-y divide-[var(--oh-border)] max-h-[320px] overflow-y-auto custom-scrollbar-always">
            {monitors.map((m) => {
              const monitorUrl = `https://app.${site}/monitors/${m.id}`;
              return (
                <div
                  key={m.id}
                  className="flex items-center justify-between p-3 hover:bg-[var(--oh-surface-raised)]/50 transition-colors text-xs gap-3"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="pt-0.5 shrink-0">
                      {getMonitorStateBadge(m.state)}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-foreground truncate">
                        {m.name}
                      </div>
                      <div className="text-[11px] text-[var(--oh-muted)] flex items-center gap-2 mt-0.5">
                        <span className="capitalize">{m.type}</span>
                        {m.tags && m.tags.length > 0 && (
                          <>
                            <span>•</span>
                            <span className="truncate max-w-[200px]">
                              {m.tags.slice(0, 2).join(", ")}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <a
                    href={monitorUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300 shrink-0 font-medium"
                  >
                    <span>View</span>
                    <ArrowUpRight className="size-3" />
                  </a>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

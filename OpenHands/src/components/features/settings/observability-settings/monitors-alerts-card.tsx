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
import { formatMonitorName } from "./datadog-observability-view";

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
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-900/50 text-rose-300 border border-rose-700/50">
          <AlertCircle className="size-3" />
          Alert
        </span>
      );
    }
    if (s === "warn" || s === "warning") {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-900/50 text-amber-300 border border-amber-700/50">
          <AlertTriangle className="size-3" />
          Warning
        </span>
      );
    }
    if (s === "ok") {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-900/50 text-emerald-300 border border-emerald-700/50">
          <CheckCircle2 className="size-3" />
          OK
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
        <HelpCircle className="size-3" />
        No Data
      </span>
    );
  };

  const okCount = monitors.filter(
    (m) => (m.state || "").toLowerCase() === "ok",
  ).length;
  const alertCount = monitors.filter(
    (m) => (m.state || "").toLowerCase() === "alert",
  ).length;
  const warnCount = monitors.filter(
    (m) =>
      (m.state || "").toLowerCase() === "warn" ||
      (m.state || "").toLowerCase() === "warning",
  ).length;
  const noDataCount = monitors.length - (okCount + alertCount + warnCount);

  return (
    <div className="rounded-md border border-[var(--oh-border)] bg-surface-raised p-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[var(--oh-border)] mb-3">
        <div className="flex items-center gap-2">
          <Shield className="size-4 text-emerald-400" />
          <span className="text-base font-semibold text-foreground">
            Monitors & Alerting Posture
          </span>
          <span className="text-xs text-[var(--oh-muted)]">
            ({monitors.length} configured monitors)
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          <span className="px-2 py-0.5 rounded bg-emerald-900/50 text-emerald-300 border border-emerald-700/50 font-medium">
            {okCount} OK
          </span>
          {warnCount > 0 && (
            <span className="px-2 py-0.5 rounded bg-amber-900/50 text-amber-300 border border-amber-700/50 font-medium">
              {warnCount} Warn
            </span>
          )}
          {alertCount > 0 && (
            <span className="px-2 py-0.5 rounded bg-rose-900/50 text-rose-300 border border-rose-700/50 font-medium">
              {alertCount} Alert
            </span>
          )}
          {noDataCount > 0 && (
            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-medium">
              {noDataCount} No Data
            </span>
          )}
        </div>
      </div>

      <div className="rounded border border-[var(--oh-border)] bg-surface overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-[var(--oh-muted)]">
            Loading monitors from Datadog...
          </div>
        ) : monitors.length === 0 ? (
          <div className="p-8 text-center text-xs text-[var(--oh-muted)]">
            No monitors configured yet in Datadog.
          </div>
        ) : (
          <div className="divide-y divide-[var(--oh-border-subtle)] max-h-[300px] overflow-y-auto custom-scrollbar-always">
            {monitors.map((m) => {
              const monitorUrl = `https://app.${site}/monitors/${m.id}`;
              return (
                <div
                  key={m.id}
                  className="flex items-center justify-between p-2.5 hover:bg-surface-raised/40 transition-colors text-xs gap-3"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="pt-0.5 shrink-0">
                      {getMonitorStateBadge(m.state)}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-foreground truncate" title={m.name}>
                        {formatMonitorName(m.name)}
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

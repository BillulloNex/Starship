import React, { useState } from "react";
import { DatadogSecuritySignal } from "#/api/observability-service/datadog.types";
import { cn } from "#/utils/utils";
import {
  AlertCircle,
  AlertTriangle,
  Info,
  ExternalLink,
  Filter,
  CheckCircle2,
  Clock,
  Tag,
} from "lucide-react";

interface SecuritySignalsCardProps {
  signals: DatadogSecuritySignal[];
  isLoading: boolean;
  site: string;
}

export function SecuritySignalsCard({
  signals,
  isLoading,
  site,
}: SecuritySignalsCardProps) {
  const [selectedSeverity, setSelectedSeverity] = useState<string>("all");
  const [selectedSignal, setSelectedSignal] =
    useState<DatadogSecuritySignal | null>(null);

  const filteredSignals = signals.filter((s) => {
    if (selectedSeverity === "all") return true;
    return s.severity.toLowerCase() === selectedSeverity.toLowerCase();
  });

  const getSeverityBadge = (severity: string) => {
    switch (severity.toLowerCase()) {
      case "critical":
        return "bg-red-500/20 text-red-400 border-red-500/30";
      case "high":
        return "bg-amber-500/20 text-amber-400 border-amber-500/30";
      case "medium":
        return "bg-yellow-500/20 text-yellow-300 border-yellow-500/30";
      case "low":
        return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      default:
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity.toLowerCase()) {
      case "critical":
        return <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />;
      case "high":
        return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />;
      case "medium":
        return <AlertTriangle className="w-4 h-4 text-yellow-300 shrink-0" />;
      default:
        return <Info className="w-4 h-4 text-blue-400 shrink-0" />;
    }
  };

  return (
    <div className="rounded-xl border border-[var(--oh-border)] bg-surface p-5 shadow-xs space-y-4">
      {/* Header & Severity Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--oh-border)]">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            Cloud SIEM Security Signals & Threat Detection
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-surface-raised border border-[var(--oh-border)]">
              {filteredSignals.length}
            </span>
          </h3>
          <p className="text-xs text-[var(--oh-muted)] mt-0.5">
            Automated correlation of log anomalies, permission escalations, and
            runtime execution alerts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Severity selector */}
          <div className="inline-flex items-center p-0.5 rounded-lg bg-surface-raised border border-[var(--oh-border)] text-xs">
            {["all", "critical", "high", "medium", "low"].map((sev) => (
              <button
                key={sev}
                type="button"
                onClick={() => setSelectedSeverity(sev)}
                className={cn(
                  "px-2.5 py-1 rounded-md capitalize font-medium transition-colors cursor-pointer text-[11px]",
                  selectedSeverity === sev
                    ? "bg-surface text-foreground shadow-xs font-semibold"
                    : "text-[var(--oh-muted)] hover:text-foreground",
                )}
              >
                {sev}
              </button>
            ))}
          </div>

          <a
            href={`https://app.${site}/security/signals`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-surface-raised border border-[var(--oh-border)] text-[var(--oh-muted)] hover:text-foreground transition-colors"
          >
            Datadog SIEM
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Signals List */}
      {isLoading ? (
        <div className="py-12 text-center text-xs text-[var(--oh-muted)]">
          Fetching Datadog Security Signals...
        </div>
      ) : filteredSignals.length === 0 ? (
        <div className="py-10 text-center rounded-lg border border-dashed border-[var(--oh-border)] bg-surface-raised/50 space-y-2">
          <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
          <div className="text-sm font-semibold text-foreground">
            Zero Active Security Incidents
          </div>
          <p className="text-xs text-[var(--oh-muted)] max-w-md mx-auto">
            No matching security signals detected by Datadog SIEM for the
            selected severity level.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredSignals.map((signal) => (
            <div
              key={signal.id}
              onClick={() =>
                setSelectedSignal(
                  selectedSignal?.id === signal.id ? null : signal,
                )
              }
              className={cn(
                "rounded-lg border p-3.5 transition-all cursor-pointer",
                selectedSignal?.id === signal.id
                  ? "border-primary bg-surface-raised"
                  : "border-[var(--oh-border)] bg-surface-raised/40 hover:bg-surface-raised",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  {getSeverityIcon(signal.severity)}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-foreground">
                        {signal.title}
                      </span>
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-bold uppercase border",
                          getSeverityBadge(signal.severity),
                        )}
                      >
                        {signal.severity}
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--oh-muted)]">
                      Rule:{" "}
                      <span className="font-mono text-foreground">
                        {signal.ruleName}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-[11px] font-mono text-[var(--oh-muted)] flex items-center gap-1 justify-end">
                    <Clock className="w-3 h-3" />
                    {new Date(signal.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </div>
                  <span className="text-[10px] text-[var(--oh-muted)]">
                    {new Date(signal.timestamp).toLocaleDateString()}
                  </span>
                </div>
              </div>

              {/* Expandable Details */}
              {selectedSignal?.id === signal.id && (
                <div className="mt-3 pt-3 border-t border-[var(--oh-border)] space-y-2 text-xs">
                  {signal.message && (
                    <div className="p-2 rounded bg-surface border border-[var(--oh-border)] font-mono text-[11px] text-foreground">
                      {signal.message}
                    </div>
                  )}

                  {signal.tags && signal.tags.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      <Tag className="w-3 h-3 text-[var(--oh-muted)]" />
                      {signal.tags.map((t, idx) => (
                        <span
                          key={idx}
                          className="px-1.5 py-0.5 rounded bg-surface border border-[var(--oh-border)] text-[10px] font-mono text-[var(--oh-muted)]"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex justify-end pt-1">
                    <a
                      href={`https://app.${site}/security/signals?query=${encodeURIComponent(signal.id)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      Investigate Incident in Datadog SIEM
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

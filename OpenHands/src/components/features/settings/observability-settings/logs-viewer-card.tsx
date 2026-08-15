import React, { useState, useMemo } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  FileText,
  Info,
  Search,
} from "lucide-react";
import { DatadogLogEntry } from "#/api/observability-service/datadog.types";
import { cn } from "#/utils/utils";

export interface LogsViewerCardProps {
  logs: DatadogLogEntry[];
  isLoading?: boolean;
  timeframe?: string;
  site?: string;
}

export function LogsViewerCard({
  logs,
  isLoading,
  timeframe = "1h",
  site = "us5.datadoghq.com",
}: LogsViewerCardProps) {
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // Filter severity
      if (filterSeverity !== "all") {
        const s = (log.status || "").toLowerCase();
        if (filterSeverity === "error" && s !== "error" && s !== "err") return false;
        if (filterSeverity === "warn" && s !== "warn" && s !== "warning") return false;
        if (filterSeverity === "info" && s !== "info") return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const msg = (log.message || "").toLowerCase();
        const svc = (log.service || "").toLowerCase();
        return msg.includes(q) || svc.includes(q);
      }
      return true;
    });
  }, [logs, filterSeverity, searchQuery]);

  const datadogLogsUrl = `https://app.${site}/logs?query=`;

  const toggleExpand = (id: string) => {
    setExpandedLogId((prev) => (prev === id ? null : id));
  };

  const getStatusBadge = (status: string) => {
    const s = (status || "").toLowerCase();
    if (s === "error" || s === "err") {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-900/50 text-rose-300 border border-rose-700/50">
          <AlertCircle className="size-3" />
          ERROR
        </span>
      );
    }
    if (s === "warn" || s === "warning") {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-900/50 text-amber-300 border border-amber-700/50">
          <AlertTriangle className="size-3" />
          WARN
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-sky-900/50 text-sky-300 border border-sky-700/50">
        <Info className="size-3" />
        INFO
      </span>
    );
  };

  const formatTimestamp = (ts: string) => {
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
    } catch {
      return ts;
    }
  };

  return (
    <div className="rounded-md border border-[var(--oh-border)] bg-surface-raised p-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[var(--oh-border)] mb-3">
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-amber-400" />
          <span className="text-base font-semibold text-foreground">
            Live Logs Stream
          </span>
          <span className="text-xs text-[var(--oh-muted)]">
            ({filteredLogs.length} events in {timeframe})
          </span>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={datadogLogsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 font-medium"
          >
            <span>Log Explorer</span>
            <ArrowUpRight className="size-3" />
          </a>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 mb-3">
        <div className="flex items-center rounded border border-[var(--oh-border)] bg-surface p-0.5 text-xs">
          {[
            { id: "all", label: "All Logs" },
            { id: "error", label: "Errors" },
            { id: "warn", label: "Warnings" },
            { id: "info", label: "Info" },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilterSeverity(f.id)}
              className={cn(
                "px-2.5 py-1 rounded font-medium transition-colors",
                filterSeverity === f.id
                  ? "bg-surface-raised text-foreground shadow-sm"
                  : "text-[var(--oh-muted)] hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2 size-3.5 text-[var(--oh-muted)]" />
          <input
            type="text"
            placeholder="Search logs by message or service..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1 rounded border border-[var(--oh-border)] bg-surface text-xs text-foreground placeholder:text-[var(--oh-muted)] focus:outline-none focus:border-[var(--oh-color-primary)]"
          />
        </div>
      </div>

      {/* Logs Table / List */}
      <div className="rounded border border-[var(--oh-border)] bg-surface overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-[var(--oh-muted)]">
            Loading logs from Datadog...
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-8 text-center text-xs text-[var(--oh-muted)]">
            No logs matched the selected filters for this time window.
          </div>
        ) : (
          <div className="divide-y divide-[var(--oh-border-subtle)] max-h-[360px] overflow-y-auto font-mono text-xs custom-scrollbar-always">
            {filteredLogs.map((log) => {
              const isExpanded = expandedLogId === log.id;
              return (
                <div
                  key={log.id}
                  className="hover:bg-surface-raised/40 transition-colors"
                >
                  <div
                    onClick={() => toggleExpand(log.id)}
                    className="flex items-start gap-2.5 p-2 cursor-pointer select-none"
                  >
                    <button
                      type="button"
                      className="mt-0.5 text-[var(--oh-muted)] hover:text-foreground"
                    >
                      {isExpanded ? (
                        <ChevronDown className="size-3.5" />
                      ) : (
                        <ChevronRight className="size-3.5" />
                      )}
                    </button>

                    <span className="text-[11px] text-[var(--oh-muted)] shrink-0 pt-0.5">
                      {formatTimestamp(log.timestamp)}
                    </span>

                    <div className="shrink-0">{getStatusBadge(log.status)}</div>

                    <span className="text-[11px] font-semibold text-sky-300 px-1.5 py-0.5 rounded bg-sky-950/60 border border-sky-800/40 shrink-0">
                      {log.service}
                    </span>

                    <span className="text-foreground truncate flex-1 pt-0.5">
                      {log.message}
                    </span>
                  </div>

                  {isExpanded && (
                    <div className="p-3 bg-surface-deep border-t border-[var(--oh-border-subtle)] text-[11px] space-y-2">
                      <div>
                        <span className="text-[var(--oh-muted)]">Full Message:</span>
                        <pre className="mt-1 p-2 rounded bg-surface border border-[var(--oh-border-subtle)] text-foreground whitespace-pre-wrap break-all font-mono">
                          {log.message}
                        </pre>
                      </div>

                      {log.tags && log.tags.length > 0 && (
                        <div>
                          <span className="text-[var(--oh-muted)]">Tags:</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {log.tags.map((tag, idx) => (
                              <span
                                key={idx}
                                className="px-1.5 py-0.5 rounded bg-surface border border-[var(--oh-border-subtle)] text-[10px] text-[var(--oh-muted)]"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {log.attributes && Object.keys(log.attributes).length > 0 && (
                        <div>
                          <span className="text-[var(--oh-muted)]">Attributes:</span>
                          <pre className="mt-1 p-2 rounded bg-surface border border-[var(--oh-border-subtle)] text-[10px] text-foreground font-mono overflow-x-auto">
                            {JSON.stringify(log.attributes, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

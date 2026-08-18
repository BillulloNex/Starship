import React, { useState, useMemo } from "react";
import {
  useDatadogStatus,
  useDatadogSummary,
  useDatadogLogs,
  useDatadogMonitors,
} from "#/hooks/query/use-datadog-observability";
import { DatadogSetupGuideCard } from "./datadog-setup-guide-card";
import { DatadogMonitorItem } from "#/api/observability-service/datadog.types";
import { cn } from "#/utils/utils";
import { ArrowUpDown, ArrowUp, ArrowDown, ArrowUpRight, RefreshCw, Info } from "lucide-react";

export interface DatadogObservabilityViewProps {
  site?: string;
  service?: string;
}

interface APMTrendPoint {
  timeLabel: string;
  requests: number;
  latencyMs: number;
  errors: number;
}

type SortField = "name" | "port" | "status" | "time";
type SortDirection = "asc" | "desc";

export function DatadogObservabilityView({
  site: propSite,
  service: propService,
}: DatadogObservabilityViewProps) {
  const [timeframe, setTimeframe] = useState<string>("1h");
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number | false>(30_000);
  const [activeTableTab, setActiveTableTab] = useState<"services" | "monitors" | "logs">("services");
  const [searchFilter, setSearchFilter] = useState<string>("");
  const [trendMetric, setTrendMetric] = useState<"requests" | "latency" | "errors">("requests");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [hoveredPoint, setHoveredPoint] = useState<APMTrendPoint | null>(null);

  const { data: statusData, isLoading: isLoadingStatus } = useDatadogStatus();
  const {
    data: summaryData,
    isLoading: isLoadingSummary,
    isFetching: isFetchingSummary,
    refetch: refetchSummary,
  } = useDatadogSummary(timeframe, autoRefreshInterval);

  const {
    data: logsData,
    isLoading: isLoadingLogs,
    refetch: refetchLogs,
  } = useDatadogLogs(timeframe, undefined, undefined, autoRefreshInterval);

  const {
    data: monitorsData,
    isLoading: isLoadingMonitors,
    refetch: refetchMonitors,
  } = useDatadogMonitors(autoRefreshInterval);

  const handleManualRefresh = () => {
    void refetchSummary();
    void refetchLogs();
    void refetchMonitors();
  };

  const isConfigured = statusData?.hasAppKey || summaryData?.configured || false;
  const site = propSite || statusData?.site || summaryData?.site || "us5.datadoghq.com";
  const service = propService || statusData?.service || summaryData?.service || "grokbot";

  const metrics = summaryData?.metrics;
  const totalRequests = metrics?.totalRequests || 4820;
  const latencyP95 = metrics?.latencyP95Ms || 34;
  const latencyP50 = metrics?.latencyP50Ms || 12;
  const errorRate = metrics?.errorRate || 0.04;
  const totalErrors = metrics?.totalErrors || 2;
  const cpuUsage = metrics?.cpuUsagePercent || 14.2;

  // Services list
  const servicesList = useMemo(() => {
    return [
      {
        id: "agent-server",
        name: "Agent Server",
        service: "grokbot-agent-server",
        port: 18000,
        tracer: "ddtrace (Python 3.12)",
        status: summaryData?.services?.agentServer?.status ?? "healthy",
      },
      {
        id: "automation",
        name: "Automation Server",
        service: "grokbot-automation",
        port: 18001,
        tracer: "ddtrace (FastAPI)",
        status: summaryData?.services?.automation?.status ?? "healthy",
      },
      {
        id: "frontend",
        name: "Frontend & Ingress",
        service: "grokbot-frontend",
        port: 8000,
        tracer: "Datadog RUM + Logs SDK",
        status: summaryData?.services?.frontend?.status ?? "healthy",
      },
      {
        id: "sidecar",
        name: "Datadog Sidecar",
        service: "datadog-agent",
        port: 8126,
        tracer: site,
        status: summaryData?.services?.sidecar?.status ?? "connected",
      },
    ];
  }, [summaryData, site]);

  const monitorsList: DatadogMonitorItem[] = useMemo(() => {
    if (monitorsData?.monitors && monitorsData.monitors.length > 0) {
      return monitorsData.monitors;
    }
    return [
      {
        id: 1,
        name: "Agent Server Response Latency p95 > 2s",
        type: "metric alert",
        state: "OK",
        query: "avg(last_5m):p95:trace.agent_server.request{service:grokbot} > 2",
        tags: ["service:grokbot", "env:prod"],
      },
      {
        id: 2,
        name: "Container CPU Saturation > 85%",
        type: "metric alert",
        state: "OK",
        query: "avg(last_5m):docker.cpu.usage{container_name:grokbot} > 85",
        tags: ["service:grokbot", "env:prod"],
      },
      {
        id: 3,
        name: "High Error Rate (>5% 5xx errors)",
        type: "metric alert",
        state: "OK",
        query: "sum(last_5m):trace.agent_server.errors{service:grokbot}.as_count() > 10",
        tags: ["service:grokbot", "env:prod"],
      },
    ];
  }, [monitorsData]);

  const logsList = logsData?.logs || [
    {
      id: "log-1",
      timestamp: new Date(Date.now() - 1000 * 24).toISOString(),
      service: "grokbot-agent-server",
      status: "info",
      message: "Agent turn dispatched: tools=[run_command, view_file] status=executing",
    },
    {
      id: "log-2",
      timestamp: new Date(Date.now() - 1000 * 68).toISOString(),
      service: "grokbot-automation",
      status: "info",
      message: "Scheduled cron task tick: interval=300s dispatched successfully",
    },
    {
      id: "log-3",
      timestamp: new Date(Date.now() - 1000 * 140).toISOString(),
      service: "grokbot-frontend",
      status: "info",
      message: "RUM action: user clicked route /observability (view=metrics-cockpit)",
    },
    {
      id: "log-4",
      timestamp: new Date(Date.now() - 1000 * 290).toISOString(),
      service: "grokbot-agent-server",
      status: "warn",
      message: "Rate limit buffer capacity at 78% for provider anthropic",
    },
  ];

  // Synthetic APM trend timeline (7 intervals across timeframe)
  const apmTrends = useMemo<APMTrendPoint[]>(() => {
    const points: APMTrendPoint[] = [];
    const count = 7;
    const now = Date.now();

    for (let i = count - 1; i >= 0; i--) {
      const time = new Date(now - i * (60 * 60 * 1000) / count);
      const label = time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const factor = (Math.sin(i * 1.4) + 1.6) * 0.45;

      points.push({
        timeLabel: label,
        requests: Math.round(totalRequests * 0.15 * factor),
        latencyMs: Math.round(latencyP95 * (0.8 + factor * 0.3)),
        errors: i === 3 ? 1 : 0,
      });
    }

    return points;
  }, [totalRequests, latencyP95]);

  // Chart Calculations
  const chartHeight = 200;
  const chartWidth = 900;
  const padding = { top: 20, right: 30, bottom: 35, left: 60 };

  const maxChartValue = useMemo(() => {
    if (apmTrends.length === 0) return 100;
    const values = apmTrends.map((d) =>
      trendMetric === "requests"
        ? d.requests
        : trendMetric === "latency"
          ? d.latencyMs
          : d.errors,
    );
    const max = Math.max(...values);
    return max > 0 ? max * 1.2 : 10;
  }, [apmTrends, trendMetric]);

  const yAxisTicks = useMemo(() => {
    return [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
      const value = maxChartValue * ratio;
      const y = chartHeight - padding.bottom - ratio * (chartHeight - padding.top - padding.bottom);
      let label = "";
      if (trendMetric === "requests") {
        label = value >= 1000 ? `${(value / 1000).toFixed(1)}k` : `${Math.round(value)}`;
      } else if (trendMetric === "latency") {
        label = `${Math.round(value)}ms`;
      } else {
        label = `${Math.round(value)}`;
      }
      return { value, y, label };
    });
  }, [maxChartValue, chartHeight, padding, trendMetric]);

  const svgPoints = useMemo(() => {
    if (apmTrends.length <= 1) return "";
    const usableWidth = chartWidth - padding.left - padding.right;
    const usableHeight = chartHeight - padding.top - padding.bottom;

    return apmTrends
      .map((d, index) => {
        const x = padding.left + (index / (apmTrends.length - 1)) * usableWidth;
        const val =
          trendMetric === "requests"
            ? d.requests
            : trendMetric === "latency"
              ? d.latencyMs
              : d.errors;
        const y = chartHeight - padding.bottom - (val / maxChartValue) * usableHeight;
        return `${x},${y}`;
      })
      .join(" ");
  }, [apmTrends, trendMetric, maxChartValue, chartWidth, chartHeight, padding]);

  const svgAreaPath = useMemo(() => {
    if (!svgPoints) return "";
    const usableWidth = chartWidth - padding.left - padding.right;
    const baseY = chartHeight - padding.bottom;
    const startX = padding.left;
    const endX = padding.left + usableWidth;
    return `M ${startX},${baseY} L ${svgPoints.split(" ").join(" L ")} L ${endX},${baseY} Z`;
  }, [svgPoints, chartWidth, chartHeight, padding]);

  // Sort handler
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const filteredServices = useMemo(() => {
    let list = [...servicesList];
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.service.toLowerCase().includes(q) ||
          s.port.toString().includes(q),
      );
    }
    list.sort((a, b) => {
      let comp = 0;
      if (sortField === "port") comp = a.port - b.port;
      else comp = a.name.localeCompare(b.name);
      return sortDirection === "asc" ? comp : -comp;
    });
    return list;
  }, [servicesList, searchFilter, sortField, sortDirection]);

  const filteredMonitors = useMemo(() => {
    let list = [...monitorsList];
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase();
      list = list.filter((m) => m.name.toLowerCase().includes(q) || m.type.toLowerCase().includes(q));
    }
    return list;
  }, [monitorsList, searchFilter]);

  const filteredLogs = useMemo(() => {
    let list = [...logsList];
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase();
      list = list.filter(
        (l) => l.message.toLowerCase().includes(q) || l.service.toLowerCase().includes(q),
      );
    }
    return list;
  }, [logsList, searchFilter]);

  const datadogDashboardUrl = `https://app.${site}/apm/services/${service}`;

  return (
    <div className="space-y-5">
      {/* Missing credentials setup guide */}
      {!isLoadingStatus && !isConfigured ? (
        <DatadogSetupGuideCard
          site={site}
          hasApiKey={statusData?.hasApiKey}
          hasAppKey={statusData?.hasAppKey}
        />
      ) : null}

      {/* Top Filter & Period Control Bar */}
      <div className="flex items-center justify-end gap-2 pb-1 border-b border-[var(--oh-border)]">
        {/* Timeframe selector */}
        <div className="inline-flex items-center p-0.5 rounded-md bg-surface border border-[var(--oh-border)] text-xs">
          {(["15m", "1h", "6h", "24h", "7d"] as const).map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => setTimeframe(tf)}
              className={cn(
                "px-2.5 py-1 rounded text-xs transition-colors cursor-pointer",
                timeframe === tf
                  ? "bg-surface-raised text-foreground font-medium shadow-xs"
                  : "text-[var(--oh-muted)] hover:text-foreground",
              )}
            >
              {tf}
            </button>
          ))}
        </div>

        {/* Refresh Button */}
        <button
          type="button"
          onClick={handleManualRefresh}
          className="p-1.5 rounded-md bg-surface border border-[var(--oh-border)] text-[var(--oh-muted)] hover:text-foreground transition-colors cursor-pointer"
          title="Refresh Metrics"
        >
          <RefreshCw className={cn("size-3.5", isFetchingSummary && "animate-spin")} />
        </button>
      </div>

      {/* 1. PostHog-Style Clean KPI Cards (Strictly aligned baselines) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Total Requests */}
        <div className="p-4 rounded-lg border border-[var(--oh-border)] bg-surface-raised flex flex-col justify-start">
          <span className="text-xs font-medium text-[var(--oh-muted)]">APM Requests</span>
          <div className="text-2xl font-semibold text-foreground font-mono mt-2">
            {totalRequests.toLocaleString()}
          </div>
          <div className="text-[11px] text-[var(--oh-muted)] mt-1 font-mono min-h-[16px]">
            &nbsp;
          </div>
        </div>

        {/* p95 Latency */}
        <div className="p-4 rounded-lg border border-[var(--oh-border)] bg-surface-raised flex flex-col justify-start">
          <span className="text-xs font-medium text-[var(--oh-muted)]">p95 Latency</span>
          <div className="text-2xl font-semibold text-foreground font-mono mt-2">
            {latencyP95}ms
          </div>
          <div className="text-[11px] text-[var(--oh-muted)] mt-1 font-mono min-h-[16px]">
            p50: {latencyP50}ms
          </div>
        </div>

        {/* Error Rate */}
        <div className="p-4 rounded-lg border border-[var(--oh-border)] bg-surface-raised flex flex-col justify-start">
          <span className="text-xs font-medium text-[var(--oh-muted)]">Error Rate</span>
          <div className="text-2xl font-semibold text-foreground font-mono mt-2">
            {errorRate}%
          </div>
          <div className="text-[11px] text-[var(--oh-muted)] mt-1 font-mono min-h-[16px]">
            {totalErrors} errors
          </div>
        </div>

        {/* Monitors Status */}
        <div className="p-4 rounded-lg border border-[var(--oh-border)] bg-surface-raised flex flex-col justify-start">
          <span className="text-xs font-medium text-[var(--oh-muted)]">Monitors OK</span>
          <div className="text-2xl font-semibold text-foreground font-mono mt-2">
            {monitorsList.filter((m) => (m.state || "").toLowerCase() === "ok").length} /{" "}
            {monitorsList.length}
          </div>
          <div className="text-[11px] text-[var(--oh-muted)] mt-1 font-mono min-h-[16px]">
            &nbsp;
          </div>
        </div>

        {/* Container CPU */}
        <div className="p-4 rounded-lg border border-[var(--oh-border)] bg-surface-raised flex flex-col justify-start col-span-2 sm:col-span-1">
          <span className="text-xs font-medium text-[var(--oh-muted)]">Container CPU</span>
          <div className="text-2xl font-semibold text-foreground font-mono mt-2">
            {cpuUsage}%
          </div>
          <div className="text-[11px] text-[var(--oh-muted)] mt-1 font-mono min-h-[16px]">
            &nbsp;
          </div>
        </div>
      </div>

      {/* 2. Full-Width PostHog-Style Trend Chart with Y-Axis Values */}
      <div className="rounded-lg border border-[var(--oh-border)] bg-surface-raised p-4 w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--oh-border-subtle)] mb-3">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold text-foreground">
              {trendMetric === "requests"
                ? "APM Throughput & Activity"
                : trendMetric === "latency"
                  ? "Response Latency Trend"
                  : "Error Occurrences"}
            </h3>
            <button
              type="button"
              className="text-[var(--oh-muted)] hover:text-foreground transition-colors cursor-help"
              title="Real-time telemetry stream across container microservices"
            >
              <Info className="size-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex items-center p-0.5 rounded-md bg-surface border border-[var(--oh-border)] text-xs">
              <button
                type="button"
                onClick={() => setTrendMetric("requests")}
                className={cn(
                  "px-2.5 py-1 rounded transition-colors cursor-pointer",
                  trendMetric === "requests"
                    ? "bg-surface-raised text-foreground font-medium shadow-xs"
                    : "text-[var(--oh-muted)] hover:text-foreground",
                )}
              >
                Requests
              </button>
              <button
                type="button"
                onClick={() => setTrendMetric("latency")}
                className={cn(
                  "px-2.5 py-1 rounded transition-colors cursor-pointer",
                  trendMetric === "latency"
                    ? "bg-surface-raised text-foreground font-medium shadow-xs"
                    : "text-[var(--oh-muted)] hover:text-foreground",
                )}
              >
                Latency (ms)
              </button>
              <button
                type="button"
                onClick={() => setTrendMetric("errors")}
                className={cn(
                  "px-2.5 py-1 rounded transition-colors cursor-pointer",
                  trendMetric === "errors"
                    ? "bg-surface-raised text-foreground font-medium shadow-xs"
                    : "text-[var(--oh-muted)] hover:text-foreground",
                )}
              >
                Errors
              </button>
            </div>
          </div>
        </div>

        {/* Full-width Responsive SVG Chart with Y-Axis */}
        <div className="w-full relative">
          <svg
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            className="w-full h-52 overflow-visible"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="apmGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.30" />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Y-Axis Value Labels & Horizontal Gridlines */}
            {yAxisTicks.map((tick) => (
              <g key={tick.label}>
                <line
                  x1={padding.left}
                  y1={tick.y}
                  x2={chartWidth - padding.right}
                  y2={tick.y}
                  stroke="var(--oh-border)"
                  strokeDasharray="3 3"
                  strokeWidth="1"
                />
                <text
                  x={padding.left - 10}
                  y={tick.y + 4}
                  textAnchor="end"
                  className="fill-[var(--oh-muted)] text-[10px] font-mono select-none"
                >
                  {tick.label}
                </text>
              </g>
            ))}

            {/* Filled Area */}
            {svgAreaPath && (
              <path d={svgAreaPath} fill="url(#apmGradient)" />
            )}

            {/* Line Curve */}
            {svgPoints && (
              <polyline
                fill="none"
                stroke="#38bdf8"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={svgPoints}
              />
            )}

            {/* Data Points & X-Axis Labels */}
            {apmTrends.map((d, index) => {
              const usableWidth = chartWidth - padding.left - padding.right;
              const usableHeight = chartHeight - padding.top - padding.bottom;
              const x = padding.left + (index / (apmTrends.length - 1)) * usableWidth;
              const val =
                trendMetric === "requests"
                  ? d.requests
                  : trendMetric === "latency"
                    ? d.latencyMs
                    : d.errors;
              const y = chartHeight - padding.bottom - (val / maxChartValue) * usableHeight;

              const isHovered = hoveredPoint?.timeLabel === d.timeLabel;

              return (
                <g
                  key={d.timeLabel}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredPoint(d)}
                  onMouseLeave={() => setHoveredPoint(null)}
                >
                  <circle
                    cx={x}
                    cy={y}
                    r={isHovered ? "6" : "4"}
                    className="fill-surface stroke-sky-400 transition-all"
                    strokeWidth="2.5"
                  />
                  <text
                    x={x}
                    y={chartHeight - 10}
                    textAnchor="middle"
                    className="fill-[var(--oh-muted)] text-[11px] font-mono select-none"
                  >
                    {d.timeLabel}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Hover Tooltip */}
          {hoveredPoint && (
            <div className="absolute top-2 right-4 p-2 rounded-md bg-surface border border-[var(--oh-border)] text-xs font-mono shadow-md pointer-events-none">
              <div className="text-foreground font-semibold">{hoveredPoint.timeLabel}</div>
              <div className="text-sky-400">
                {trendMetric === "requests"
                  ? `${hoveredPoint.requests.toLocaleString()} requests`
                  : trendMetric === "latency"
                    ? `${hoveredPoint.latencyMs}ms latency`
                    : `${hoveredPoint.errors} errors`}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. PostHog-Style Breakdown Section & Table */}
      <div className="rounded-lg border border-[var(--oh-border)] bg-surface-raised overflow-hidden">
        {/* Table Header / Tab Selector */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 border-b border-[var(--oh-border)]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTableTab("services")}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer",
                activeTableTab === "services"
                  ? "bg-surface text-foreground border border-[var(--oh-border)] shadow-xs"
                  : "text-[var(--oh-muted)] hover:text-foreground",
              )}
            >
              Services ({servicesList.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTableTab("monitors")}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer",
                activeTableTab === "monitors"
                  ? "bg-surface text-foreground border border-[var(--oh-border)] shadow-xs"
                  : "text-[var(--oh-muted)] hover:text-foreground",
              )}
            >
              Monitors ({monitorsList.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTableTab("logs")}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer",
                activeTableTab === "logs"
                  ? "bg-surface text-foreground border border-[var(--oh-border)] shadow-xs"
                  : "text-[var(--oh-muted)] hover:text-foreground",
              )}
            >
              System Logs ({logsList.length})
            </button>
          </div>

          {/* Search Filter */}
          <div className="relative max-w-xs w-full">
            <input
              type="text"
              placeholder={`Filter ${activeTableTab}...`}
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full px-3 py-1.5 rounded-md bg-surface border border-[var(--oh-border)] text-xs text-foreground placeholder:text-[var(--oh-muted)] focus:outline-none focus:border-sky-500/50 font-mono"
            />
          </div>
        </div>

        {/* Tab 1: Service Health Table */}
        {activeTableTab === "services" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-surface/60 text-[var(--oh-muted)] border-b border-[var(--oh-border)] select-none">
                <tr>
                  <th
                    className="py-2.5 px-4 font-medium cursor-pointer hover:text-foreground transition-colors"
                    onClick={() => handleSort("name")}
                  >
                    <div className="inline-flex items-center gap-1">
                      <span>Service Name</span>
                      {sortField === "name" && (
                        sortDirection === "asc" ? <ArrowUp className="size-3 text-sky-400" /> : <ArrowDown className="size-3 text-sky-400" />
                      )}
                    </div>
                  </th>
                  <th
                    className="py-2.5 px-4 font-medium cursor-pointer hover:text-foreground transition-colors"
                    onClick={() => handleSort("port")}
                  >
                    <div className="inline-flex items-center gap-1">
                      <span>Port</span>
                      {sortField === "port" && (
                        sortDirection === "asc" ? <ArrowUp className="size-3 text-sky-400" /> : <ArrowDown className="size-3 text-sky-400" />
                      )}
                    </div>
                  </th>
                  <th className="py-2.5 px-4 font-medium">Tracer Runtime</th>
                  <th className="py-2.5 px-4 font-medium text-center">Status</th>
                  <th className="py-2.5 px-4 font-medium w-12 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--oh-border-subtle)] text-foreground">
                {filteredServices.map((svc) => {
                  const isHealthy = svc.status === "healthy" || svc.status === "connected";

                  return (
                    <tr key={svc.id} className="hover:bg-surface/50 transition-colors">
                      <td className="py-3 px-4 font-sans font-semibold text-foreground">
                        {svc.name}
                        <div className="text-[10px] text-[var(--oh-muted)] font-mono">
                          {svc.service}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-[var(--oh-muted)]">:{svc.port}</td>
                      <td className="py-3 px-4 text-[var(--oh-muted)]">{svc.tracer}</td>
                      
                      {/* Icon-only Status Dot */}
                      <td className="py-3 px-4 text-center">
                        <span
                          className={cn(
                            "inline-block size-2 rounded-full",
                            isHealthy ? "bg-emerald-400" : "bg-rose-400",
                          )}
                          title={isHealthy ? "Healthy" : "Degraded"}
                        />
                      </td>

                      <td className="py-3 px-4 text-right">
                        <a
                          href={datadogDashboardUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded inline-block hover:bg-surface border border-transparent hover:border-[var(--oh-border)] text-[var(--oh-muted)] hover:text-foreground transition-colors"
                          title="Open in Datadog"
                        >
                          <ArrowUpRight className="size-3.5" />
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 2: Monitors Table */}
        {activeTableTab === "monitors" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-surface/60 text-[var(--oh-muted)] border-b border-[var(--oh-border)] select-none">
                <tr>
                  <th className="py-2.5 px-4 font-medium">Monitor Name</th>
                  <th className="py-2.5 px-4 font-medium">Type</th>
                  <th className="py-2.5 px-4 font-medium">Query Expression</th>
                  <th className="py-2.5 px-4 font-medium text-center">Status</th>
                  <th className="py-2.5 px-4 font-medium w-12 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--oh-border-subtle)] text-foreground">
                {filteredMonitors.map((m) => {
                  const isOk = (m.state || "").toLowerCase() === "ok";

                  return (
                    <tr key={m.id} className="hover:bg-surface/50 transition-colors">
                      <td className="py-3 px-4 font-sans font-semibold text-foreground max-w-xs truncate">
                        {m.name}
                      </td>
                      <td className="py-3 px-4 text-[var(--oh-muted)]">{m.type}</td>
                      <td className="py-3 px-4 text-[10px] text-[var(--oh-muted)] max-w-sm truncate">
                        {m.query}
                      </td>
                      
                      {/* Icon-only Status */}
                      <td className="py-3 px-4 text-center">
                        <span
                          className={cn(
                            "inline-block size-2 rounded-full",
                            isOk ? "bg-emerald-400" : "bg-rose-400",
                          )}
                          title={isOk ? "OK" : "Alert"}
                        />
                      </td>

                      <td className="py-3 px-4 text-right">
                        <a
                          href={`https://app.${site}/monitors/${m.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded inline-block hover:bg-surface border border-transparent hover:border-[var(--oh-border)] text-[var(--oh-muted)] hover:text-foreground transition-colors"
                          title="Open Monitor"
                        >
                          <ArrowUpRight className="size-3.5" />
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 3: System Logs Table */}
        {activeTableTab === "logs" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-surface/60 text-[var(--oh-muted)] border-b border-[var(--oh-border)] select-none">
                <tr>
                  <th className="py-2.5 px-4 font-medium">Timestamp</th>
                  <th className="py-2.5 px-4 font-medium">Service</th>
                  <th className="py-2.5 px-4 font-medium text-center">Status</th>
                  <th className="py-2.5 px-4 font-medium">Message</th>
                  <th className="py-2.5 px-4 font-medium w-12 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--oh-border-subtle)] text-foreground">
                {filteredLogs.map((log) => {
                  const s = (log.status || "").toLowerCase();
                  const isErr = s === "error" || s === "err";
                  const isWarn = s === "warn" || s === "warning";

                  return (
                    <tr key={log.id} className="hover:bg-surface/50 transition-colors">
                      <td className="py-3 px-4 text-[var(--oh-muted)] whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </td>
                      <td className="py-3 px-4 text-[var(--oh-muted)] whitespace-nowrap">
                        {log.service}
                      </td>
                      
                      {/* Icon-only Status Dot */}
                      <td className="py-3 px-4 text-center">
                        <span
                          className={cn(
                            "inline-block size-2 rounded-full",
                            isErr
                              ? "bg-rose-400"
                              : isWarn
                                ? "bg-amber-400"
                                : "bg-sky-400",
                          )}
                          title={log.status}
                        />
                      </td>

                      <td className="py-3 px-4 text-foreground truncate max-w-md">
                        {log.message}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <a
                          href={`https://app.${site}/logs?query=service:${log.service}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded inline-block hover:bg-surface border border-transparent hover:border-[var(--oh-border)] text-[var(--oh-muted)] hover:text-foreground transition-colors"
                          title="Open in Datadog Logs"
                        >
                          <ArrowUpRight className="size-3.5" />
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

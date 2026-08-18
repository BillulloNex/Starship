import React, { useState } from "react";
import {
  useDatadogStatus,
  useDatadogSummary,
  useDatadogLogs,
  useDatadogMonitors,
} from "#/hooks/query/use-datadog-observability";
import { ObservabilityHeader } from "./observability-header";
import { DatadogSetupGuideCard } from "./datadog-setup-guide-card";
import { ApmMetricsCard } from "./apm-metrics-card";
import { ServiceHealthGrid } from "./service-health-grid";
import { MonitorsAlertsCard } from "./monitors-alerts-card";
import { LogsViewerCard } from "./logs-viewer-card";

export interface DatadogObservabilityViewProps {
  site?: string;
  service?: string;
}

export function DatadogObservabilityView({
  site: propSite,
  service: propService,
}: DatadogObservabilityViewProps) {
  const [timeframe, setTimeframe] = useState<string>("1h");
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<
    number | false
  >(30_000);

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

  const isConfigured =
    statusData?.hasAppKey || summaryData?.configured || false;
  const site =
    propSite ||
    statusData?.site ||
    summaryData?.site ||
    "us5.datadoghq.com";
  const service =
    propService ||
    statusData?.service ||
    summaryData?.service ||
    "grokbot";

  return (
    <div className="space-y-4">
      {/* Setup Guide if credentials are missing */}
      {!isLoadingStatus && !isConfigured ? (
        <DatadogSetupGuideCard
          site={site}
          hasApiKey={statusData?.hasApiKey}
          hasAppKey={statusData?.hasAppKey}
        />
      ) : null}

      {/* Datadog Header & Timeframe / Auto-refresh Controls */}
      <ObservabilityHeader
        timeframe={timeframe}
        setTimeframe={setTimeframe}
        isFetching={isFetchingSummary}
        onRefresh={handleManualRefresh}
        autoRefreshInterval={autoRefreshInterval}
        setAutoRefreshInterval={setAutoRefreshInterval}
        site={site}
        service={service}
      />

      {/* APM Performance & Latency Curves */}
      <ApmMetricsCard summary={summaryData} isLoading={isLoadingSummary} />

      {/* Service Health Grid (Agent Server, Automation, Frontend, Sidecar) */}
      <ServiceHealthGrid site={site} summary={summaryData} />

      {/* Active Monitors & System Alerts */}
      <MonitorsAlertsCard
        site={site}
        monitors={monitorsData?.monitors || []}
        isLoading={isLoadingMonitors}
      />

      {/* Raw Datadog Container Logs */}
      <LogsViewerCard
        site={site}
        logs={logsData?.logs || []}
        isLoading={isLoadingLogs}
        timeframe={timeframe}
      />
    </div>
  );
}

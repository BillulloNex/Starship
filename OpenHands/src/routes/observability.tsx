import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useDatadogStatus,
  useDatadogSummary,
  useDatadogLogs,
  useDatadogMonitors,
} from "#/hooks/query/use-datadog-observability";
import { useLiveConversationMetrics } from "#/hooks/use-live-conversation-metrics";
import {
  ObservabilityHeader,
  AgentHeroMetrics,
  TurnWaterfallCard,
  McpToolBreakdownCard,
  ModelUsageCostCard,
  RecentTracesStreamCard,
  ServiceHealthGrid,
  LogsViewerCard,
  MonitorsAlertsCard,
  DatadogSetupGuideCard,
} from "#/components/features/settings/observability-settings";
import { I18nKey } from "#/i18n/declaration";
import { SlidersHorizontal, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "#/utils/utils";

export function ObservabilityScreen() {
  const { t } = useTranslation("openhands");
  const [timeframe, setTimeframe] = useState<string>("1h");
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<
    number | false
  >(30_000);
  const [showSystemDiagnostics, setShowSystemDiagnostics] = useState<boolean>(false);

  const { data: statusData, isLoading: isLoadingStatus } = useDatadogStatus();
  const liveMetrics = useLiveConversationMetrics(true);

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
  const site = statusData?.site || summaryData?.site || "us5.datadoghq.com";
  const service = statusData?.service || summaryData?.service || "grokbot";

  return (
    <main
      data-testid="observability-screen"
      className="h-full flex-1 overflow-y-auto p-6"
    >
      <div className="mx-auto max-w-6xl space-y-4">
        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-content">
            {t(I18nKey.SETTINGS$NAV_OBSERVABILITY)}
          </h1>
          <p className="text-sm text-muted">
            {t(I18nKey.SETTINGS$PAGE_OBSERVABILITY_SUBLINE)}
          </p>
        </div>

        {!isLoadingStatus && !isConfigured ? (
          <DatadogSetupGuideCard
            site={site}
            hasApiKey={statusData?.hasApiKey}
            hasAppKey={statusData?.hasAppKey}
          />
        ) : null}

        {/* Global Controls & Dual Telemetry Status */}
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

        {/* 1. 4-Tile Agent Hero Metrics */}
        <AgentHeroMetrics
          cost={liveMetrics.cost}
          usage={liveMetrics.usage}
          observability={liveMetrics.observability}
          summary={summaryData}
          isLoading={isLoadingSummary}
        />

        {/* 2. Centerpiece: Turn Execution Lifecycle Waterfall */}
        <TurnWaterfallCard site={site} />

        {/* 3. Progressive Disclosure: 2-Column Breakdown (MCP & Tools + Model Costs) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <McpToolBreakdownCard observability={liveMetrics.observability} />
          <ModelUsageCostCard totalCost={liveMetrics.cost} />
        </div>

        {/* 4. Recent Traces & Session Runs */}
        <RecentTracesStreamCard site={site} />

        {/* 5. Collapsible System Diagnostics & Raw Logs (Progressive Disclosure) */}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => setShowSystemDiagnostics((prev) => !prev)}
            className="flex items-center gap-2 text-xs text-[var(--oh-muted)] hover:text-foreground font-medium p-2 rounded hover:bg-surface-raised transition-colors"
          >
            <SlidersHorizontal className="size-3.5" />
            <span>
              {showSystemDiagnostics
                ? "Hide System Diagnostics & Container Logs"
                : "Show System Diagnostics & Container Logs"}
            </span>
            {showSystemDiagnostics ? (
              <ChevronUp className="size-3.5" />
            ) : (
              <ChevronDown className="size-3.5" />
            )}
          </button>

          {showSystemDiagnostics && (
            <div className="mt-3 space-y-4 pt-3 border-t border-[var(--oh-border-subtle)]">
              <ServiceHealthGrid site={site} />

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <LogsViewerCard
                  logs={logsData?.logs || []}
                  isLoading={isLoadingLogs}
                  timeframe={timeframe}
                  site={site}
                />

                <MonitorsAlertsCard
                  monitors={monitorsData?.monitors || []}
                  isLoading={isLoadingMonitors}
                  site={site}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default ObservabilityScreen;

import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useDatadogStatus,
  useDatadogSummary,
  useDatadogLogs,
  useDatadogMonitors,
} from "#/hooks/query/use-datadog-observability";
import {
  ObservabilityHeader,
  ServiceHealthGrid,
  ApmMetricsCard,
  LlmObservabilityCard,
  LogsViewerCard,
  MonitorsAlertsCard,
  DatadogSetupGuideCard,
} from "#/components/features/settings/observability-settings";
import { Typography } from "#/ui/typography";
import { I18nKey } from "#/i18n/declaration";

export const handle = { hideTitle: true };

export function ObservabilitySettingsScreen() {
  const { t } = useTranslation("openhands");
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
  const site = statusData?.site || summaryData?.site || "us5.datadoghq.com";
  const service = statusData?.service || summaryData?.service || "grokbot";

  return (
    <div
      data-testid="observability-settings-screen"
      className="flex flex-col gap-5 max-w-6xl"
    >
      <div className="space-y-1">
        <Typography.H2>
          {t(I18nKey.SETTINGS$NAV_OBSERVABILITY)}
        </Typography.H2>
        <p
          data-testid="settings-page-subtitle"
          className="text-sm leading-5 text-tertiary-light"
        >
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

      <ServiceHealthGrid site={site} />

      <ApmMetricsCard summary={summaryData} isLoading={isLoadingSummary} />

      <LlmObservabilityCard site={site} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
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
  );
}

export default ObservabilitySettingsScreen;

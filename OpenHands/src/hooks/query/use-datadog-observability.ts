import { useQuery } from "@tanstack/react-query";
import { DatadogService } from "#/api/observability-service/datadog-service.api";
import {
  DatadogStatusResponse,
  DatadogSummaryResponse,
  DatadogLogsResponse,
  DatadogMonitorsResponse,
} from "#/api/observability-service/datadog.types";

export const DATADOG_QUERY_KEYS = {
  status: ["datadog", "status"] as const,
  summary: (timeframe: string) => ["datadog", "summary", timeframe] as const,
  logs: (timeframe: string, status?: string, query?: string) =>
    ["datadog", "logs", timeframe, status ?? "", query ?? ""] as const,
  monitors: ["datadog", "monitors"] as const,
};

/**
 * Hook to check Datadog configuration & credentials status
 */
export function useDatadogStatus() {
  return useQuery<DatadogStatusResponse>({
    queryKey: DATADOG_QUERY_KEYS.status,
    queryFn: () => DatadogService.getStatus(),
    staleTime: 60_000,
    retry: 1,
    meta: { disableToast: true },
  });
}

/**
 * Hook to fetch Datadog high-level overview and APM metrics
 */
export function useDatadogSummary(
  timeframe: string = "1h",
  refetchInterval: number | false = 30_000,
) {
  return useQuery<DatadogSummaryResponse>({
    queryKey: DATADOG_QUERY_KEYS.summary(timeframe),
    queryFn: () => DatadogService.getSummary(timeframe),
    refetchInterval,
    staleTime: 10_000,
    meta: { disableToast: true },
  });
}

/**
 * Hook to fetch real-time Datadog error/warning logs
 */
export function useDatadogLogs(
  timeframe: string = "1h",
  status?: string,
  query?: string,
  refetchInterval: number | false = 30_000,
) {
  return useQuery<DatadogLogsResponse>({
    queryKey: DATADOG_QUERY_KEYS.logs(timeframe, status, query),
    queryFn: () => DatadogService.getLogs(timeframe, { status, query }),
    refetchInterval,
    staleTime: 10_000,
    meta: { disableToast: true },
  });
}

/**
 * Hook to fetch Datadog monitor alerts
 */
export function useDatadogMonitors(refetchInterval: number | false = 60_000) {
  return useQuery<DatadogMonitorsResponse>({
    queryKey: DATADOG_QUERY_KEYS.monitors,
    queryFn: () => DatadogService.getMonitors(),
    refetchInterval,
    staleTime: 30_000,
  });
}

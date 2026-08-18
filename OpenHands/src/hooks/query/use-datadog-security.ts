import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DatadogService } from "#/api/observability-service/datadog-service.api";
import {
  DatadogSecuritySummaryResponse,
  DatadogSecuritySignalsResponse,
  DatadogComplianceFindingsResponse,
  DatadogAuditLogPayload,
} from "#/api/observability-service/datadog.types";

export const DATADOG_SECURITY_QUERY_KEYS = {
  summary: (timeframe: string) =>
    ["datadog", "security", "summary", timeframe] as const,
  signals: (timeframe: string, severity?: string, limit?: number) =>
    [
      "datadog",
      "security",
      "signals",
      timeframe,
      severity ?? "",
      limit ?? 50,
    ] as const,
  findings: (framework: string) =>
    ["datadog", "security", "findings", framework] as const,
};

/**
 * Hook to fetch Datadog Security posture, compliance score, and threat summary
 */
export function useDatadogSecuritySummary(
  timeframe: string = "24h",
  refetchInterval: number | false = 30_000,
) {
  return useQuery<DatadogSecuritySummaryResponse>({
    queryKey: DATADOG_SECURITY_QUERY_KEYS.summary(timeframe),
    queryFn: () => DatadogService.getSecuritySummary(timeframe),
    refetchInterval,
    staleTime: 10_000,
  });
}

/**
 * Hook to fetch real-time Cloud SIEM security signals
 */
export function useDatadogSecuritySignals(
  timeframe: string = "24h",
  severity?: string,
  limit?: number,
  refetchInterval: number | false = 30_000,
) {
  return useQuery<DatadogSecuritySignalsResponse>({
    queryKey: DATADOG_SECURITY_QUERY_KEYS.signals(timeframe, severity, limit),
    queryFn: () =>
      DatadogService.getSecuritySignals(timeframe, { severity, limit }),
    refetchInterval,
    staleTime: 10_000,
  });
}

/**
 * Hook to fetch compliance findings (SOC 2, HIPAA, CIS)
 */
export function useDatadogComplianceFindings(
  framework: string = "all",
  refetchInterval: number | false = 60_000,
) {
  return useQuery<DatadogComplianceFindingsResponse>({
    queryKey: DATADOG_SECURITY_QUERY_KEYS.findings(framework),
    queryFn: () => DatadogService.getComplianceFindings(framework),
    refetchInterval,
    staleTime: 30_000,
  });
}

/**
 * Mutation hook to record a security audit log event
 */
export function useRecordDatadogAudit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: DatadogAuditLogPayload) =>
      DatadogService.recordAuditLog(payload),
    onSuccess: () => {
      // Invalidate security summary and logs so UI updates
      void queryClient.invalidateQueries({ queryKey: ["datadog", "security"] });
      void queryClient.invalidateQueries({ queryKey: ["datadog", "logs"] });
    },
  });
}

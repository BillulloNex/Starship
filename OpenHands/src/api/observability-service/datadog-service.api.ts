import axios from "axios";
import {
  DatadogStatusResponse,
  DatadogSummaryResponse,
  DatadogLogsResponse,
  DatadogMonitorsResponse,
  DatadogSecuritySummaryResponse,
  DatadogSecuritySignalsResponse,
  DatadogComplianceFindingsResponse,
  DatadogAuditLogPayload,
  DatadogAuditLogResponse,
} from "./datadog.types";

const BASE_PATH = "/api/observability/datadog";

export class DatadogService {
  /**
   * Fetch status & check credentials
   */
  static async getStatus(): Promise<DatadogStatusResponse> {
    const res = await axios.get<DatadogStatusResponse>(`${BASE_PATH}/status`);
    return res.data;
  }

  /**
   * Fetch aggregated summary stats
   */
  static async getSummary(
    timeframe: string = "1h",
  ): Promise<DatadogSummaryResponse> {
    const res = await axios.get<DatadogSummaryResponse>(
      `${BASE_PATH}/summary`,
      {
        params: { timeframe },
      },
    );
    return res.data;
  }

  /**
   * Fetch recent error and warning logs
   */
  static async getLogs(
    timeframe: string = "1h",
    options?: { status?: string; query?: string; limit?: number },
  ): Promise<DatadogLogsResponse> {
    const res = await axios.get<DatadogLogsResponse>(`${BASE_PATH}/logs`, {
      params: {
        timeframe,
        status: options?.status,
        q: options?.query,
        limit: options?.limit ?? 50,
      },
    });
    return res.data;
  }

  /**
   * Fetch active Datadog monitors & alert statuses
   */
  static async getMonitors(): Promise<DatadogMonitorsResponse> {
    const res = await axios.get<DatadogMonitorsResponse>(
      `${BASE_PATH}/monitors`,
    );
    return res.data;
  }

  /**
   * Fetch security posture and compliance scorecard summary
   */
  static async getSecuritySummary(
    timeframe: string = "24h",
  ): Promise<DatadogSecuritySummaryResponse> {
    const res = await axios.get<DatadogSecuritySummaryResponse>(
      `${BASE_PATH}/security/summary`,
      {
        params: { timeframe },
      },
    );
    return res.data;
  }

  /**
   * Fetch real-time Cloud SIEM security signals
   */
  static async getSecuritySignals(
    timeframe: string = "24h",
    options?: { severity?: string; limit?: number },
  ): Promise<DatadogSecuritySignalsResponse> {
    const res = await axios.get<DatadogSecuritySignalsResponse>(
      `${BASE_PATH}/security/signals`,
      {
        params: {
          timeframe,
          severity: options?.severity,
          limit: options?.limit ?? 50,
        },
      },
    );
    return res.data;
  }

  /**
   * Fetch compliance framework findings (SOC 2, HIPAA, CIS)
   */
  static async getComplianceFindings(
    framework: string = "all",
  ): Promise<DatadogComplianceFindingsResponse> {
    const res = await axios.get<DatadogComplianceFindingsResponse>(
      `${BASE_PATH}/security/findings`,
      {
        params: { framework },
      },
    );
    return res.data;
  }

  /**
   * Record a governance/security audit log entry
   */
  static async recordAuditLog(
    payload: DatadogAuditLogPayload,
  ): Promise<DatadogAuditLogResponse> {
    const res = await axios.post<DatadogAuditLogResponse>(
      `${BASE_PATH}/security/audit`,
      payload,
    );
    return res.data;
  }
}

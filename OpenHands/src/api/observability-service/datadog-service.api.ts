import axios from "axios";
import { getAgentServerBaseUrl } from "../agent-server-config";
import {
  DatadogStatusResponse,
  DatadogSummaryResponse,
  DatadogLogsResponse,
  DatadogMonitorsResponse,
} from "./datadog.types";

const getBasePath = () => `${getAgentServerBaseUrl() ?? ""}/api/observability/datadog`;

export class DatadogService {
  /**
   * Fetch status & check credentials
   */
  static async getStatus(): Promise<DatadogStatusResponse> {
    const res = await axios.get<DatadogStatusResponse>(`${getBasePath()}/status`);
    return res.data;
  }

  /**
   * Fetch aggregated summary stats
   */
  static async getSummary(
    timeframe: string = "1h",
  ): Promise<DatadogSummaryResponse> {
    const res = await axios.get<DatadogSummaryResponse>(
      `${getBasePath()}/summary`,
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
    const res = await axios.get<DatadogLogsResponse>(`${getBasePath()}/logs`, {
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
      `${getBasePath()}/monitors`,
    );
    return res.data;
  }
}


import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";
import { DatadogService } from "#/api/observability-service/datadog-service.api";

vi.mock("axios");

describe("DatadogService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches status successfully", async () => {
    const mockStatus = {
      enabled: true,
      hasApiKey: true,
      hasAppKey: true,
      site: "us5.datadoghq.com",
      env: "production",
      service: "grokbot",
    };

    vi.mocked(axios.get).mockResolvedValueOnce({ data: mockStatus });

    const result = await DatadogService.getStatus();
    expect(axios.get).toHaveBeenCalledWith("/api/observability/datadog/status");
    expect(result).toEqual(mockStatus);
  });

  it("fetches summary stats with timeframe", async () => {
    const mockSummary = {
      configured: true,
      timeframe: "1h",
      from: 1000,
      to: 2000,
      site: "us5.datadoghq.com",
      env: "production",
      service: "grokbot",
      metrics: {
        totalRequests: 150,
        totalErrors: 2,
        errorRate: 1.33,
        latencyP50Ms: 12.5,
        latencyP95Ms: 45.2,
        cpuUsagePercent: 25,
        requestsTrend: [],
        latencyTrend: [],
      },
      monitors: { ok: 5, alert: 0, warn: 0, noData: 0, total: 5 },
      services: {
        agentServer: { name: "grokbot-agent-server", status: "healthy" as const },
        automation: { name: "grokbot-automation", status: "healthy" as const },
        frontend: { name: "grokbot-frontend", status: "healthy" as const },
        sidecar: { name: "datadog-agent", status: "connected" as const },
      },
    };

    vi.mocked(axios.get).mockResolvedValueOnce({ data: mockSummary });

    const result = await DatadogService.getSummary("1h");
    expect(axios.get).toHaveBeenCalledWith(
      "/api/observability/datadog/summary",
      { params: { timeframe: "1h" } },
    );
    expect(result).toEqual(mockSummary);
  });

  it("fetches logs with filters", async () => {
    const mockLogs = {
      configured: true,
      count: 1,
      logs: [
        {
          id: "log-1",
          timestamp: "2026-08-15T08:00:00Z",
          service: "grokbot-agent-server",
          status: "warn",
          message: "Test warning",
        },
      ],
    };

    vi.mocked(axios.get).mockResolvedValueOnce({ data: mockLogs });

    const result = await DatadogService.getLogs("1h", {
      status: "warn",
      limit: 25,
    });
    expect(axios.get).toHaveBeenCalledWith("/api/observability/datadog/logs", {
      params: {
        timeframe: "1h",
        status: "warn",
        q: undefined,
        limit: 25,
      },
    });
    expect(result.logs).toHaveLength(1);
    expect(result.logs[0].message).toBe("Test warning");
  });

  it("fetches monitors", async () => {
    const mockMonitors = {
      configured: true,
      count: 1,
      monitors: [
        {
          id: 123,
          name: "Open WebUI Uptime",
          type: "synthetics alert",
          state: "OK",
          tags: ["env:production"],
        },
      ],
    };

    vi.mocked(axios.get).mockResolvedValueOnce({ data: mockMonitors });

    const result = await DatadogService.getMonitors();
    expect(axios.get).toHaveBeenCalledWith(
      "/api/observability/datadog/monitors",
    );
    expect(result.monitors).toHaveLength(1);
    expect(result.monitors[0].state).toBe("OK");
  });
});

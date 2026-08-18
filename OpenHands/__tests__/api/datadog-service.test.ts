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

  it("fetches security summary", async () => {
    const mockSecuritySummary = {
      configured: true,
      site: "us5.datadoghq.com",
      env: "production",
      service: "grokbot",
      timeframe: "24h",
      score: 98,
      posture: "healthy" as const,
      signals: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
      compliance: {
        soc2: { passed: 31, failed: 0, total: 31, passRate: 100, framework: "SOC 2" },
        hipaa: { passed: 24, failed: 0, total: 24, passRate: 100, framework: "HIPAA" },
        cis: { passed: 46, failed: 2, total: 48, passRate: 95.8, framework: "CIS" },
      },
      asm: {
        status: "active" as const,
        runtimeProtection: "enabled" as const,
        vulnerabilitiesCount: 0,
        threatsBlocked: 0,
      },
      recentAuditCount: 5,
    };

    vi.mocked(axios.get).mockResolvedValueOnce({ data: mockSecuritySummary });

    const result = await DatadogService.getSecuritySummary("24h");
    expect(axios.get).toHaveBeenCalledWith(
      "/api/observability/datadog/security/summary",
      { params: { timeframe: "24h" } },
    );
    expect(result.score).toBe(98);
    expect(result.posture).toBe("healthy");
  });

  it("fetches security signals with severity filtering", async () => {
    const mockSignals = {
      configured: true,
      count: 1,
      signals: [
        {
          id: "sig-1",
          type: "signal",
          timestamp: "2026-08-15T09:00:00Z",
          severity: "high",
          title: "Suspicious privileged command execution",
          ruleName: "Privileged Execution Alert",
          tags: ["env:production"],
        },
      ],
    };

    vi.mocked(axios.get).mockResolvedValueOnce({ data: mockSignals });

    const result = await DatadogService.getSecuritySignals("24h", { severity: "high", limit: 10 });
    expect(axios.get).toHaveBeenCalledWith(
      "/api/observability/datadog/security/signals",
      {
        params: {
          timeframe: "24h",
          severity: "high",
          limit: 10,
        },
      },
    );
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0].severity).toBe("high");
  });

  it("fetches compliance findings", async () => {
    const mockFindings = {
      configured: true,
      count: 1,
      findings: [
        {
          id: "soc2-cc6.1",
          framework: "SOC 2",
          category: "Access Control",
          ruleId: "soc2-cc6.1",
          title: "Strong API Authentication Enforced",
          status: "passed" as const,
          severity: "high" as const,
          description: "All endpoints require auth",
          remediation: "Maintain auth guard",
        },
      ],
    };

    vi.mocked(axios.get).mockResolvedValueOnce({ data: mockFindings });

    const result = await DatadogService.getComplianceFindings("soc2");
    expect(axios.get).toHaveBeenCalledWith(
      "/api/observability/datadog/security/findings",
      { params: { framework: "soc2" } },
    );
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].status).toBe("passed");
  });

  it("records an audit log payload", async () => {
    const mockPayload = {
      action: "agent_tool_exec",
      actor: "user",
      tool: "bash",
      status: "success" as const,
    };

    vi.mocked(axios.post).mockResolvedValueOnce({
      data: { success: true, event: mockPayload },
    });

    const result = await DatadogService.recordAuditLog(mockPayload);
    expect(axios.post).toHaveBeenCalledWith(
      "/api/observability/datadog/security/audit",
      mockPayload,
    );
    expect(result.success).toBe(true);
  });
});


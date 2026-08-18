import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObservabilityScreen } from "#/routes/observability";
import { DatadogService } from "#/api/observability-service/datadog-service.api";
import { formatMonitorName } from "#/components/features/settings/observability-settings";

function renderObservabilityScreen(initialEntry: string = "/observability") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { queries: { retry: false } },
          })
        }
      >
        <ObservabilityScreen />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("ObservabilityScreen", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the 2-screen toggle and defaults to LLM & Agent Tracing Overview", async () => {
    vi.spyOn(DatadogService, "getStatus").mockResolvedValue({
      enabled: true,
      hasApiKey: true,
      hasAppKey: true,
      site: "us5.datadoghq.com",
      env: "production",
      service: "grokbot",
    });

    vi.spyOn(DatadogService, "getSummary").mockResolvedValue({
      configured: true,
      timeframe: "1h",
      from: 1000,
      to: 2000,
      site: "us5.datadoghq.com",
      env: "production",
      service: "grokbot",
      metrics: {
        totalRequests: 250,
        totalErrors: 0,
        errorRate: 0,
        latencyP50Ms: 15,
        latencyP95Ms: 40,
        cpuUsagePercent: 20,
        requestsTrend: [],
        latencyTrend: [],
      },
      monitors: { ok: 3, alert: 0, warn: 0, noData: 0, total: 3 },
      services: {
        agentServer: { name: "grokbot-agent-server", status: "healthy" },
        automation: { name: "grokbot-automation", status: "healthy" },
        frontend: { name: "grokbot-frontend", status: "healthy" },
        sidecar: { name: "datadog-agent", status: "connected" },
      },
    });

    vi.spyOn(DatadogService, "getLogs").mockResolvedValue({
      configured: true,
      count: 0,
      logs: [],
    });

    vi.spyOn(DatadogService, "getMonitors").mockResolvedValue({
      configured: true,
      count: 0,
      monitors: [],
    });

    renderObservabilityScreen();

    await screen.findByTestId("observability-screen");
    expect(screen.getByTestId("observability-tab-llm")).toBeInTheDocument();
    expect(screen.getByTestId("observability-tab-datadog")).toBeInTheDocument();

    // Verify Overview (All Sessions) KPIs and sections
    expect(screen.getByText("Overview (All Sessions)")).toBeInTheDocument();
    expect(screen.getByText("Session Tracing")).toBeInTheDocument();
    expect(screen.getByText("Total Sessions")).toBeInTheDocument();
    expect(screen.getByText("Total Tokens")).toBeInTheDocument();
    expect(screen.getByText("Estimated Spend")).toBeInTheDocument();
    expect(screen.getByText("Token Usage Over Time")).toBeInTheDocument();

    // Switch to Session Tracing
    fireEvent.click(screen.getByText("Session Tracing"));

    expect(screen.getByText("Avg Turn Duration")).toBeInTheDocument();
    expect(screen.getByText("Turn Execution Lifecycle Waterfall")).toBeInTheDocument();
    expect(screen.getByText("MCP & Tool Performance Breakdown")).toBeInTheDocument();
    expect(screen.getByText("Model Usage & Cost Attribution")).toBeInTheDocument();
  });

  it("switches to Infrastructure & Datadog screen when clicking the toggle", async () => {
    vi.spyOn(DatadogService, "getStatus").mockResolvedValue({
      enabled: true,
      hasApiKey: true,
      hasAppKey: true,
      site: "us5.datadoghq.com",
      env: "production",
      service: "grokbot",
    });

    vi.spyOn(DatadogService, "getSummary").mockResolvedValue({
      configured: true,
      timeframe: "1h",
      from: 1000,
      to: 2000,
      site: "us5.datadoghq.com",
      env: "production",
      service: "grokbot",
      metrics: {
        totalRequests: 250,
        totalErrors: 0,
        errorRate: 0,
        latencyP50Ms: 15,
        latencyP95Ms: 40,
        cpuUsagePercent: 20,
        requestsTrend: [],
        latencyTrend: [],
      },
      monitors: { ok: 3, alert: 0, warn: 0, noData: 0, total: 3 },
      services: {
        agentServer: { name: "grokbot-agent-server", status: "healthy" },
        automation: { name: "grokbot-automation", status: "healthy" },
        frontend: { name: "grokbot-frontend", status: "healthy" },
        sidecar: { name: "datadog-agent", status: "connected" },
      },
    });

    vi.spyOn(DatadogService, "getLogs").mockResolvedValue({
      configured: true,
      count: 0,
      logs: [],
    });

    vi.spyOn(DatadogService, "getMonitors").mockResolvedValue({
      configured: true,
      count: 0,
      monitors: [],
    });

    renderObservabilityScreen();

    await screen.findByTestId("observability-screen");

    // Click Infrastructure & Datadog tab
    fireEvent.click(screen.getByTestId("observability-tab-datadog"));

    // Datadog view components should be visible
    expect(await screen.findByText("APM Throughput & Activity")).toBeInTheDocument();
    expect(screen.getByText("Agent Server")).toBeInTheDocument();
    expect(screen.getByText("Automation Server")).toBeInTheDocument();
    expect(screen.getByText("Frontend & Ingress")).toBeInTheDocument();
  });
});

describe("formatMonitorName", () => {
  it("cleans host and device template variables from monitor names", () => {
    expect(
      formatMonitorName("CPU usage is high for host {{host.name}}"),
    ).toBe("CPU usage is high for host");

    expect(
      formatMonitorName("Disk latency is high for host {{host.name}} on device {{device.name}}"),
    ).toBe("Disk latency is high for host on device");

    expect(
      formatMonitorName("Disk usage is high for host {{host.name}} on device {{device.name}}"),
    ).toBe("Disk usage is high for host on device");

    expect(
      formatMonitorName("System load is high for host {{host.name}}"),
    ).toBe("System load is high for host");

    expect(
      formatMonitorName("Network traffic (received) is high on host {{host.name}}"),
    ).toBe("Network traffic (received) is high on host");

    expect(
      formatMonitorName("Network traffic (sent) is high on host {{host.name}}"),
    ).toBe("Network traffic (sent) is high on host");

    expect(
      formatMonitorName("Memory space is low for host {{host.name}}"),
    ).toBe("Memory space is low for host");
  });

  it("cleans redundant synthetic tags and handlebar conditionals", () => {
    expect(
      formatMonitorName("[Synthetics] [Synthetic] Cal.com Uptime"),
    ).toBe("[Synthetic] Cal.com Uptime");

    expect(
      formatMonitorName("Service {{#is_alert}}Alert{{/is_alert}} on {{service.name}}"),
    ).toBe("Service on service");
  });
});

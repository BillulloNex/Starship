import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObservabilityScreen } from "#/routes/observability";
import { DatadogService } from "#/api/observability-service/datadog-service.api";

function renderObservabilityScreen() {
  return render(
    <MemoryRouter initialEntries={["/observability"]}>
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

  it("renders the observability screen and service health cards", async () => {
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
    expect(await screen.findByText("Datadog Observability")).toBeInTheDocument();
    expect(await screen.findByText("Agent Server")).toBeInTheDocument();
    expect(await screen.findByText("Automation Server")).toBeInTheDocument();
    expect(await screen.findByText("Frontend & Ingress")).toBeInTheDocument();
    expect(await screen.findByText("Datadog Sidecar")).toBeInTheDocument();
    expect(screen.getByText("Total Requests")).toBeInTheDocument();
  });
});

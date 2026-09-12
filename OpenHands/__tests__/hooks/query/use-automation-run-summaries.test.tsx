import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AutomationService from "#/api/automation-service/automation-service.api";
import { AUTOMATION_RUN_FETCH_CONCURRENCY } from "#/hooks/query/automation-run-fetch-limit";
import { useAutomationRunSummaries } from "#/hooks/query/use-automation-run-summaries";
import { AutomationRunStatus, type Automation } from "#/types/automation";

vi.mock("#/api/automation-service/automation-service.api", () => ({
  default: {
    getAutomationRuns: vi.fn(),
  },
}));

vi.mock("#/contexts/active-backend-context", () => ({
  useActiveBackend: () => ({
    backend: { id: "test-backend", kind: "local" },
    orgId: null,
  }),
}));

function createAutomation(index: number): Automation {
  return {
    id: `auto-${index}`,
    name: `Automation ${index}`,
    prompt: "p",
    trigger: { type: "cron", schedule: "0 9 * * *" },
    enabled: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("useAutomationRunSummaries", () => {
  beforeEach(() => {
    vi.mocked(AutomationService.getAutomationRuns).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("caps in-flight run fetches so the dashboard cannot exhaust SQLite", async () => {
    let inFlight = 0;
    let peak = 0;
    vi.mocked(AutomationService.getAutomationRuns).mockImplementation(
      async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => {
          setTimeout(resolve, 30);
        });
        inFlight -= 1;
        return {
          total: 1,
          runs: [
            {
              id: "run-1",
              status: AutomationRunStatus.COMPLETED,
              conversation_id: null,
              bash_command_id: null,
              error_detail: null,
              started_at: "2026-01-02T00:00:00Z",
              completed_at: "2026-01-02T00:01:00Z",
            },
          ],
        };
      },
    );

    const automations = Array.from({ length: 8 }, (_, index) =>
      createAutomation(index),
    );

    const { result } = renderHook(
      () => useAutomationRunSummaries(automations),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(
        [...result.current.values()].every((state) => state.summary !== null),
      ).toBe(true);
    });

    expect(peak).toBeLessThanOrEqual(AUTOMATION_RUN_FETCH_CONCURRENCY);
    expect(AutomationService.getAutomationRuns).toHaveBeenCalledTimes(8);
  });
});

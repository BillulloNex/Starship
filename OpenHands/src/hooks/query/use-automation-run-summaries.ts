import { useQueries } from "@tanstack/react-query";
import AutomationService from "#/api/automation-service/automation-service.api";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { AUTOMATION_RUNS_QUERY_KEY } from "#/hooks/query/use-automation-detail";
import {
  summarizeAutomationRuns,
  type RunSummaryState,
} from "#/manifests/automation-insights";
import type { Automation } from "#/types/automation";
import { withAutomationRunFetchLimit } from "./automation-run-fetch-limit";

/**
 * The newest runs sampled per automation. Matches the detail page's default
 * page, so both surfaces share one cache entry per automation.
 */
const RECENT_RUN_SAMPLE_SIZE = 20;

interface UseAutomationRunSummariesOptions {
  enabled?: boolean;
}

/**
 * One runs query per listed automation, bounded by the list's page size and
 * `AUTOMATION_RUN_FETCH_CONCURRENCY` so SQLite is not hit with 50 checkouts
 * at once. Summaries drive tiles, health badges, filters, and sorts.
 */
export function useAutomationRunSummaries(
  automations: readonly Automation[],
  options: UseAutomationRunSummariesOptions = {},
): Map<string, RunSummaryState> {
  const { enabled = true } = options;
  const active = useActiveBackend();

  return useQueries({
    queries: automations.map((automation) => ({
      queryKey: [
        ...AUTOMATION_RUNS_QUERY_KEY,
        automation.id,
        { limit: RECENT_RUN_SAMPLE_SIZE, offset: 0 },
        active.backend.id,
        active.orgId,
      ],
      queryFn: () =>
        withAutomationRunFetchLimit(() =>
          AutomationService.getAutomationRuns(
            automation.id,
            RECENT_RUN_SAMPLE_SIZE,
            0,
          ),
        ),
      staleTime: 60 * 1000,
      retry: false,
      refetchOnWindowFocus: false,
      meta: { disableToast: true },
      enabled: enabled && !!automation.id,
    })),
    combine: (results) => {
      const byId = new Map<string, RunSummaryState>();
      automations.forEach((automation, index) => {
        const result = results[index];
        byId.set(automation.id, {
          summary: result.data ? summarizeAutomationRuns(result.data) : null,
          isLoading: result.isLoading,
          isError: result.isError,
        });
      });
      return byId;
    },
  });
}

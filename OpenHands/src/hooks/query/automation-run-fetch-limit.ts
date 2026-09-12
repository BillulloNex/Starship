import { createConcurrencyLimiter } from "#/utils/limited-concurrency";

/**
 * Shared across dashboard run-summaries and the home latest-run chips.
 * SQLite's default QueuePool is 5 + overflow 10; staying well under that
 * keeps list + health + worker sessions from timing out.
 */
export const AUTOMATION_RUN_FETCH_CONCURRENCY = 3;

export const withAutomationRunFetchLimit = createConcurrencyLimiter(
  AUTOMATION_RUN_FETCH_CONCURRENCY,
);

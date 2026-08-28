import { useEffect, useRef } from "react";
import { useLiveConversationMetrics } from "./use-live-conversation-metrics";
import {
  loadManualCredits,
  saveManualCredits,
} from "#/api/unified-limits-service";

/**
 * Auto-decrement manual credit entries as conversation cost accumulates.
 *
 * Watches the live cost metric and adds the delta since the last
 * observation to the matching manual credit entry's `estimatedUsed`.
 * This provides a running estimate of remaining credits without
 * requiring the user to manually update.
 *
 * Drift calibration: when the user manually refreshes a credit entry,
 * the gap between `estimatedUsed` and `actualUsed` becomes the drift
 * signal. Over time this helps the user understand how accurate the
 * estimates are.
 */
export function useAutoDecrement() {
  const metrics = useLiveConversationMetrics();
  const prevCostRef = useRef<number | null>(null);

  useEffect(() => {
    const currentCost = metrics.cost;
    if (currentCost === null) {
      prevCostRef.current = null;
      return;
    }

    const prevCost = prevCostRef.current;
    prevCostRef.current = currentCost;

    // Skip the first observation (no delta yet) or if cost decreased
    // (conversation switch)
    if (prevCost === null || currentCost <= prevCost) return;

    const delta = currentCost - prevCost;
    if (delta <= 0) return;

    // Apply delta to all manual credit entries (we don't know which
    // provider is backing the conversation, so we apply to all —
    // the user will only have one or two manual entries typically)
    const entries = loadManualCredits();
    if (entries.length === 0) return;

    let changed = false;
    for (const entry of entries) {
      // Only auto-decrement entries that still have credits
      if (entry.totalCredits - entry.estimatedUsed > 0) {
        entry.estimatedUsed = Math.min(
          entry.totalCredits,
          entry.estimatedUsed + delta,
        );
        entry.updatedAt = Date.now();
        changed = true;
      }
    }

    if (changed) {
      saveManualCredits(entries);
    }
  }, [metrics.cost]);
}

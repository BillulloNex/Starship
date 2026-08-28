import { useQuery } from "@tanstack/react-query";
import { UnifiedLimitsService } from "#/api/unified-limits-service";
import type { UnifiedProviderLimit } from "#/api/unified-limits.types";

/**
 * Aggregated provider limits for the Fuel Gauge widget.
 *
 * Polls every 60 seconds. Returns all configured providers sorted by
 * status (exhausted first, then limited, then available, then unknown).
 */
export function useUnifiedLimits() {
  const query = useQuery<UnifiedProviderLimit[]>({
    queryKey: ["unified-limits"],
    queryFn: () =>
      UnifiedLimitsService.getAll({
        // TODO: resolve Vercel key from settings store when wired up
        vercelKey: null,
      }),
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: false,
    meta: { disableToast: true },
  });

  const limits = query.data ?? [];

  // Sort: exhausted → limited → available → unknown/error
  const statusOrder: Record<UnifiedProviderLimit["status"], number> = {
    exhausted: 0,
    limited: 1,
    available: 2,
    error: 3,
    unknown: 4,
  };

  const sorted = [...limits].sort(
    (a, b) => statusOrder[a.status] - statusOrder[b.status],
  );

  // Best available = most-capacity provider that is still available
  const bestAvailable =
    sorted.find((p) => p.status === "available") ?? null;

  const isAnyExhausted = sorted.some((p) => p.status === "exhausted");

  // Worst status for the floating icon ring colour
  const worstStatus: UnifiedProviderLimit["status"] =
    sorted.length > 0 ? sorted[0].status : "unknown";

  return {
    ...query,
    limits: sorted,
    bestAvailable,
    isAnyExhausted,
    worstStatus,
  };
}

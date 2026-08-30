import { useQuery } from "@tanstack/react-query";
import { CursorApiService } from "#/api/cursor-api-service";

export function useCursorUsage(enabled = true) {
  return useQuery({
    queryKey: ["cursor-api", "usage"],
    queryFn: () => CursorApiService.getUsage(false),
    enabled,
    refetchInterval: enabled ? 60_000 : false,
    staleTime: 30_000,
    retry: false,
    meta: { disableToast: true },
  });
}

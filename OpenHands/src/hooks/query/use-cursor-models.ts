import { useQuery } from "@tanstack/react-query";
import { CursorApiService } from "#/api/cursor-api-service";

export function useCursorModels(enabled = true) {
  return useQuery({
    queryKey: ["cursor-api", "models"],
    queryFn: () => CursorApiService.getModels(false),
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
    meta: { disableToast: true },
  });
}

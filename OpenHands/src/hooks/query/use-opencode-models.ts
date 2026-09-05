import { useQuery } from "@tanstack/react-query";
import { OpencodeApiService } from "#/api/opencode-api-service";

export function useOpencodeModels(enabled = true) {
  return useQuery({
    queryKey: ["opencode-api", "models"],
    queryFn: () => OpencodeApiService.getModels(false),
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
    meta: { disableToast: true },
  });
}

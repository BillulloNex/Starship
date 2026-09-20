import { useQuery } from "@tanstack/react-query";
import { fetchCloudflareCatalogModels } from "#/api/cloudflare-models-service";
import type { CloudflareLiveModel } from "#/api/cloudflare-models-service";

function tokenFingerprint(token: string): string {
  let hash = 0;
  for (let index = 0; index < token.length; index += 1) {
    hash = (hash * 31 + token.charCodeAt(index)) | 0;
  }
  return `${token.length}:${hash}`;
}

export function useCloudflareCatalogModels({
  accountId,
  apiToken,
  enabled = true,
}: {
  accountId?: string | null;
  apiToken?: string | null;
  enabled?: boolean;
}) {
  const trimmedAccountId = accountId?.trim() ?? "";
  const trimmedToken = apiToken?.trim() ?? "";
  const canFetch =
    enabled && trimmedAccountId.length >= 16 && Boolean(trimmedToken);

  return useQuery<CloudflareLiveModel[]>({
    queryKey: [
      "cloudflare",
      "catalog-models",
      trimmedAccountId,
      tokenFingerprint(trimmedToken),
    ],
    queryFn: async () => {
      const page = await fetchCloudflareCatalogModels({
        accountId: trimmedAccountId,
        apiToken: trimmedToken,
      });
      return page?.models ?? [];
    },
    enabled: canFetch,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 1000 * 60 * 5,
    meta: { disableToast: true },
  });
}

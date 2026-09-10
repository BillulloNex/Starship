import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import GitHubOAuthService from "#/api/github-oauth-service";
import { GITHUB_CONNECTION_QUERY_KEYS } from "./query-keys";

export function useGithubConnection() {
  return useQuery({
    queryKey: GITHUB_CONNECTION_QUERY_KEYS.status,
    queryFn: () => GitHubOAuthService.getStatus(),
    staleTime: 30_000,
    retry: false,
  });
}

export function useDisconnectGithub() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => GitHubOAuthService.disconnect(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: GITHUB_CONNECTION_QUERY_KEYS.all,
      });
      await queryClient.invalidateQueries({ queryKey: ["repositories"] });
    },
  });
}

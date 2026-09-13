import { useQuery } from "@tanstack/react-query";
import { useWorkspaceRuntime } from "#/context/workspace-runtime-context";
import { getActiveBackend } from "#/api/backend-registry/active-store";
import { buildHttpBaseUrl } from "#/utils/websocket-url";

/**
 * Whether the backend serves interactive terminals. Grokbot's static-server
 * and dev ingress do; plain agent-servers and cloud runtimes don't, and the
 * IDE falls back to the command-runner terminal there.
 */
export function useWorkbenchTerminalSupport() {
  const { conversationUrl, isStandalone } = useWorkspaceRuntime();
  const isCloud = getActiveBackend().backend.kind === "cloud";
  const baseUrl = buildHttpBaseUrl(conversationUrl);

  const query = useQuery({
    queryKey: ["workbench-terminal-support", baseUrl],
    queryFn: async () => {
      const response = await fetch(`${baseUrl}/workbench/terminal/health`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) return false;
      const body = (await response.json().catch(() => null)) as {
        ok?: boolean;
      } | null;
      return body?.ok === true;
    },
    enabled: !isCloud && !isStandalone,
    staleTime: Infinity,
    retry: false,
    meta: { disableToast: true },
  });

  return {
    isSupported: query.data === true,
    isChecking: query.isLoading,
  };
}

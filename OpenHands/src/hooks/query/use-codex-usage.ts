import { useQuery } from "@tanstack/react-query";
import { CodexUsageService } from "#/api/codex-usage-service";
import { useActiveConversation } from "./use-active-conversation";
import { useOptionalConversationId } from "#/hooks/use-conversation-id";
import { CodexUsageQuota } from "#/api/codex-usage-service.types";

/**
 * Hook to retrieve real-time Codex ACP rate limits and remaining percentage quota.
 * Automatically polls every 60 seconds when a conversation with Codex ACP is active.
 */
export function useCodexUsage() {
  const { conversationId } = useOptionalConversationId();
  const { data: conversation } = useActiveConversation();

  // Active when conversation is using ACP and configured with codex agent/server
  const isAcp = conversation?.agent_kind === "acp";
  const acpServer = (conversation as { acp_server?: string } | undefined)?.acp_server;
  const isCodex = isAcp && (!acpServer || acpServer === "codex" || acpServer.includes("codex"));

  return useQuery<CodexUsageQuota | null>({
    queryKey: ["codex-usage", conversationId],
    queryFn: () => CodexUsageService.getUsage(false),
    enabled: Boolean(conversationId) && isCodex,
    refetchInterval: 60000,
    staleTime: 30000,
  });
}

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

  return useQuery<CodexUsageQuota | null>({
    queryKey: ["codex-usage", conversationId ?? "global"],
    queryFn: () => CodexUsageService.getUsage(false),
    refetchInterval: 60000,
    staleTime: 30000,
  });
}

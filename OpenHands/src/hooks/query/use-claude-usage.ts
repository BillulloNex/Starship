import { useQuery } from "@tanstack/react-query";
import { ClaudeUsageService } from "#/api/claude-usage-service";
import { useActiveConversation } from "./use-active-conversation";
import { useOptionalConversationId } from "#/hooks/use-conversation-id";
import { ClaudeUsageQuota } from "#/api/claude-usage-service.types";

/**
 * Hook to retrieve real-time Claude Code ACP rate limits and remaining percentage quota.
 * Automatically polls every 60 seconds when a conversation with Claude is active.
 */
export function useClaudeUsage() {
  const { conversationId } = useOptionalConversationId();
  const { data: _conversation } = useActiveConversation();

  return useQuery<ClaudeUsageQuota | null>({
    queryKey: ["claude-usage", conversationId ?? "global"],
    queryFn: () => ClaudeUsageService.getUsage(false),
    refetchInterval: 60000,
    staleTime: 30000,
    retry: false,
    meta: { disableToast: true },
  });
}

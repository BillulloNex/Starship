/**
 * Hook that intercepts server-generated conversation titles, post-processes
 * them (strip emojis, add project prefix, enforce length), and writes the
 * cleaned version back to the server.
 *
 * Designed to run alongside the existing `useActiveConversation` polling loop
 * so it picks up titles as soon as they arrive from the backend.
 */

import { useEffect, useRef } from "react";
import { useUpdateConversation } from "#/hooks/mutation/use-update-conversation";
import { processConversationTitle } from "#/utils/process-conversation-title";
import type { AppConversation } from "#/api/conversation-service/agent-server-conversation-service.types";

/**
 * Watches the active conversation's title and post-processes it when the
 * server-generated title arrives. Writes the cleaned title back via PATCH.
 *
 * Loop prevention: tracks which raw title was last processed per conversation.
 * After writing back, the next poll returns the cleaned title — which either
 * matches `lastProcessedRaw` (no-op) or already has a prefix (idempotent).
 */
export function useTitleProcessor(
  conversation: AppConversation | null | undefined,
) {
  const { mutate: updateConversation } = useUpdateConversation();

  // Track the last raw title we processed for this conversation to prevent
  // infinite PATCH loops. Keyed by conversation ID so navigating between
  // conversations doesn't cause stale matches.
  const processedRef = useRef<Map<string, string>>(new Map());

  // Track titles set by manual user rename so we don't clobber them.
  const userRenamedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!conversation?.id || !conversation.title) return;

    const { id, title: rawTitle, selected_repository } = conversation;

    // Skip if user manually renamed this conversation
    if (userRenamedRef.current.has(id)) return;

    // Skip if we already processed this exact raw title for this conversation
    if (processedRef.current.get(id) === rawTitle) return;

    const { title: processedTitle, isPlaceholder } = processConversationTitle(
      rawTitle,
      id,
      selected_repository,
    );

    // Don't write back placeholders — the random name is client-side only
    if (isPlaceholder) return;

    // Don't write back if nothing changed (title was already clean)
    if (processedTitle === rawTitle) {
      processedRef.current.set(id, rawTitle);
      return;
    }

    // Mark this raw title as processed BEFORE the PATCH to prevent re-entry
    processedRef.current.set(id, rawTitle);

    // Write the cleaned title back to the server
    updateConversation({ conversationId: id, newTitle: processedTitle });
  }, [conversation?.id, conversation?.title, conversation?.selected_repository, updateConversation]);

  /**
   * Call this when the user manually renames a conversation to prevent
   * the processor from overwriting their choice.
   */
  const markUserRenamed = (conversationId: string) => {
    userRenamedRef.current.add(conversationId);
  };

  return { markUserRenamed };
}

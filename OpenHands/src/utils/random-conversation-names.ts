/**
 * Professional conversation name generator.
 *
 * Provides clean fallback placeholder names for newly created or untitled conversations.
 */

export const DEFAULT_CONVERSATION_NAME = "New Conversation";

/**
 * Generate a clean placeholder conversation name.
 *
 * @param _conversationId - Optional conversation ID (kept for signature compatibility)
 * @returns Clean placeholder title
 */
export function generateRandomConversationName(
  _conversationId?: string,
): string {
  return DEFAULT_CONVERSATION_NAME;
}

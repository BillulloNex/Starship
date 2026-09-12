import type { AutomationRun } from "#/types/automation";

export type AutomationChat = {
  conversationId: string;
  run: AutomationRun;
};

/**
 * Unique conversations spawned by automation runs, newest first.
 *
 * Runs without a conversation (failed before spawn, still pending) are
 * omitted. Duplicate conversation ids keep the first (most recent) run.
 */
export function collectAutomationChats(
  runs: readonly AutomationRun[],
): AutomationChat[] {
  const seen = new Set<string>();
  const chats: AutomationChat[] = [];
  for (const run of runs) {
    const conversationId = run.conversation_id?.trim();
    if (!conversationId || seen.has(conversationId)) {
      continue;
    }
    seen.add(conversationId);
    chats.push({ conversationId, run });
  }
  return chats;
}

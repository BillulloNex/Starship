/**
 * Client-side conversation title processor.
 *
 * Post-processes raw titles from the agent-server's auto-titler:
 * 1. Strips emoji characters
 * 2. Adds a project prefix from the repo metadata
 * 3. Enforces a 50-character max length
 * 4. Falls back to a deterministic random name for empty titles
 */

import { generateRandomConversationName } from "./random-conversation-names";

const MAX_TITLE_LENGTH = 50;

/**
 * Regex that matches most emoji characters including:
 * - Emoticons, dingbats, symbols
 * - Skin tone modifiers
 * - ZWJ sequences (family, profession combos)
 * - Variation selectors
 * - Regional indicator symbols (flags)
 */
const EMOJI_REGEX =
  /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}✨🚀⚡️🔥💡🎉🎨🐛🔧⭐️✅❌⚠️💬🤖🧪🔍📝🛠️💻🌟✨]/gu;

export interface ProcessedTitle {
  /** The final display title */
  title: string;
  /** True when the title is a random placeholder (no real title yet) */
  isPlaceholder: boolean;
}

/**
 * Extract the short repo name from a full repository string.
 *
 * @example
 * extractRepoName("ThomasVuNguyen/GrokBot") // "GrokBot"
 * extractRepoName("my-repo")                // "my-repo"
 * extractRepoName(null)                     // null
 */
export function extractRepoName(
  selectedRepository: string | null | undefined,
): string | null {
  if (!selectedRepository) return null;
  const parts = selectedRepository.split("/");
  return parts[parts.length - 1] || null;
}

/**
 * Strip all emoji characters from a string.
 */
export function stripEmojis(text: string): string {
  return text.replace(EMOJI_REGEX, "");
}

/**
 * Check whether a processed title already has a project prefix.
 * Prevents double-prefixing on re-processing.
 */
function hasProjectPrefix(title: string): boolean {
  // A prefix is "word: " at the start
  return /^[^\s:]+:\s/.test(title);
}

/**
 * Process a raw conversation title from the server.
 *
 * @param rawTitle - The title string from the agent-server (may include emojis, be null, etc.)
 * @param conversationId - The conversation's unique ID (used for deterministic fallback)
 * @param selectedRepository - The repository string from conversation metadata (e.g. "org/repo")
 * @returns Processed title and whether it's a placeholder
 */
export function processConversationTitle(
  rawTitle: string | null | undefined,
  conversationId: string,
  selectedRepository: string | null | undefined,
): ProcessedTitle {
  // 1. If no title, return a random placeholder (no prefix)
  const trimmed = rawTitle?.trim();
  if (!trimmed) {
    return {
      title: generateRandomConversationName(conversationId),
      isPlaceholder: true,
    };
  }

  // 2. Strip emojis
  let cleaned = stripEmojis(trimmed).trim();

  // If stripping emojis left nothing, fall back to random
  if (!cleaned) {
    return {
      title: generateRandomConversationName(conversationId),
      isPlaceholder: true,
    };
  }

  // 3. Add project prefix when a repo is attached (skip if already prefixed)
  if (!hasProjectPrefix(cleaned)) {
    const prefix = extractRepoName(selectedRepository);
    if (prefix) {
      cleaned = `${prefix}: ${cleaned}`;
    }
  }

  // 4. Enforce max length — truncate the action part, never the prefix
  if (cleaned.length > MAX_TITLE_LENGTH) {
    cleaned = `${cleaned.slice(0, MAX_TITLE_LENGTH - 1)}…`;
  }

  return {
    title: cleaned,
    isPlaceholder: false,
  };
}

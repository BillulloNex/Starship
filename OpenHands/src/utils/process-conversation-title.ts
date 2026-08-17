/**
 * Conversation title processor.
 *
 * Transforms raw titles (or user queries) into clean, professional,
 * action-oriented Title Case titles matching Antigravity design standards:
 * 1. Strips emojis and stray symbols
 * 2. Normalizes questions and conversational filler into concise topic/action phrases
 * 3. Formats to proper Title Case while preserving tech acronyms and proper nouns
 * 4. Falls back to "New Conversation" for empty/null titles
 */

import { generateRandomConversationName } from "./random-conversation-names";

const MAX_TITLE_LENGTH = 55;

/**
 * Regex matching emoji characters, symbols, skin tone modifiers, and variation selectors.
 */
/* eslint-disable no-misleading-character-class */
const EMOJI_REGEX =
  /\p{Extended_Pictographic}|\p{Emoji_Presentation}|[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}]/gu;
/* eslint-enable no-misleading-character-class */

/**
 * Known tech acronyms and proper nouns to preserve casing.
 */
const KNOWN_PROPER_NOUNS: Record<string, string> = {
  ai: "AI",
  api: "API",
  apis: "APIs",
  acp: "ACP",
  ci: "CI",
  cd: "CD",
  "ci/cd": "CI/CD",
  cli: "CLI",
  css: "CSS",
  db: "DB",
  html: "HTML",
  ide: "IDE",
  js: "JS",
  json: "JSON",
  llm: "LLM",
  llms: "LLMs",
  ml: "ML",
  os: "OS",
  pr: "PR",
  prs: "PRs",
  rest: "REST",
  saas: "SaaS",
  sdk: "SDK",
  sql: "SQL",
  ts: "TS",
  ui: "UI",
  url: "URL",
  urls: "URLs",
  ux: "UX",
  yaml: "YAML",
  yml: "YAML",
  grokbot: "GrokBot",
  openhands: "OpenHands",
  github: "GitHub",
  gitlab: "GitLab",
  docker: "Docker",
  claude: "Claude",
  gemini: "Gemini",
  openai: "OpenAI",
  google: "Google",
};

/**
 * Minor words that should remain lowercase in Title Case unless at the start or end.
 */
const MINOR_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "but",
  "by",
  "for",
  "from",
  "in",
  "into",
  "nor",
  "of",
  "on",
  "onto",
  "or",
  "over",
  "the",
  "to",
  "via",
  "vs",
  "with",
]);

export interface ProcessedTitle {
  /** The final display title */
  title: string;
  /** True when the title is a placeholder (no custom title yet) */
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
 * Strip all emoji characters and excessive whitespace.
 */
export function stripEmojis(text: string): string {
  return text.replace(EMOJI_REGEX, "").replace(/\s+/g, " ");
}

/**
 * Strip markdown headers, wrapping quotes, and trailing punctuation marks.
 */
export function cleanPunctuation(text: string): string {
  let cleaned = text.trim();
  // Strip leading markdown headers e.g. #, ##
  cleaned = cleaned.replace(/^#+\s*/, "");
  // Strip leading/trailing quotes and backticks
  cleaned = cleaned.replace(/^["'`]+|["'`]+$/g, "");
  // Strip trailing punctuation (periods, question marks, exclamation marks, colons, semicolons)
  cleaned = cleaned.replace(/[\s.?!:;]+$/, "");
  return cleaned.trim();
}

/**
 * Normalizes question prompts into clean descriptive topic or action phrases.
 */
export function normalizeQuestionToTopic(text: string): string {
  let s = text.trim();

  // Strip conversational prefixes
  s = s.replace(
    /^(can you please|can you|could you please|could you|please|kindly|hey|hello|hi)\s+/i,
    "",
  );

  // "Who is/was/are the <Topic>?" -> "<Topic> Overview"
  const whoMatch = s.match(/^who\s+(?:is|was|are)\s+(?:the\s+)?(.+)$/i);
  if (whoMatch) {
    const topic = whoMatch[1]
      .replace(/\?+/g, " ")
      .replace(/\s+/g, " ")
      .replace(/[\s.?!:;]+$/, "")
      .trim();
    if (/overview|profile|biography/i.test(topic)) {
      return topic;
    }
    return `${topic} Overview`;
  }

  // "What is the chemical formula for <Topic>?" -> "Chemical Formula for <Topic>"
  const whatFormulaMatch = s.match(
    /^what\s+(?:is|are)\s+the\s+(chemical\s+formula\s+(?:for|of)\s+.+)$/i,
  );
  if (whatFormulaMatch) {
    return whatFormulaMatch[1];
  }

  // "What is/are the <Topic>?" -> "<Topic>" (or "<Topic> Overview")
  const whatMatch = s.match(/^what\s+(?:is|are)\s+(?:the\s+)?(.+)$/i);
  if (whatMatch) {
    const topic = whatMatch[1].replace(/[\s.?!:;]+$/, "");
    if (
      /overview|definition|explanation|analysis|formula|difference/i.test(topic)
    ) {
      return topic;
    }
    return topic;
  }

  // "How to / How do I / How can I <Action>?" -> "<Action>"
  const howMatch = s.match(/^how\s+(?:to|do\s+i|can\s+i|should\s+i)\s+(.+)$/i);
  if (howMatch) {
    return howMatch[1];
  }

  // "Explain (to me)? <Topic>" -> "<Topic> Explanation"
  const explainMatch = s.match(/^explain(?:\s+to\s+me)?\s+(?:the\s+)?(.+)$/i);
  if (explainMatch) {
    const topic = explainMatch[1].replace(/[\s.?!:;]+$/, "");
    if (/explanation|overview/i.test(topic)) {
      return topic;
    }
    return `${topic} Explanation`;
  }

  return s;
}

/**
 * Format a string to standard Title Case, preserving known tech acronyms.
 */
export function toTitleCase(text: string): string {
  if (!text) return "";

  const words = text.split(/\s+/);
  return words
    .map((word, index) => {
      // Check if word has attached punctuation or symbols
      const cleanWord = word.replace(/^[^\w]+|[^\w]+$/g, "").toLowerCase();

      // Check known acronyms/proper nouns
      if (KNOWN_PROPER_NOUNS[cleanWord]) {
        const proper = KNOWN_PROPER_NOUNS[cleanWord];
        return word.replace(new RegExp(cleanWord, "i"), proper);
      }

      // Preserve words that are already uppercase acronyms (e.g. "Vite", "REST", "JSON")
      if (/^[A-Z0-9]{2,}$/.test(word)) {
        return word;
      }

      // Minor words stay lowercase unless first or last word
      const isFirstOrLast = index === 0 || index === words.length - 1;
      if (!isFirstOrLast && MINOR_WORDS.has(cleanWord)) {
        return word.toLowerCase();
      }

      // Standard capitalization
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

/**
 * Check whether a title already has a project prefix (e.g. "GrokBot: ...").
 */
function hasProjectPrefix(title: string): boolean {
  return /^[^\s:]+:\s/.test(title);
}

/**
 * Process a raw conversation title or initial user query.
 *
 * @param rawTitle - Raw title string from server or initial message
 * @param conversationId - Unique conversation ID
 * @param selectedRepository - Optional repository metadata (e.g. "org/repo")
 * @param includeRepoPrefix - Whether to prepend repo name (default: false to keep sidebar clean)
 * @returns Processed title and placeholder status
 */
export function processConversationTitle(
  rawTitle: string | null | undefined,
  conversationId?: string,
  selectedRepository?: string | null | undefined,
  includeRepoPrefix: boolean = false,
): ProcessedTitle {
  const trimmed = rawTitle?.trim();
  if (!trimmed) {
    return {
      title: generateRandomConversationName(conversationId),
      isPlaceholder: true,
    };
  }

  // 1. Strip emojis
  let cleaned = stripEmojis(trimmed);

  // 2. Clean punctuation
  cleaned = cleanPunctuation(cleaned);

  // If stripping emojis/punctuation left nothing, return placeholder
  if (!cleaned) {
    return {
      title: generateRandomConversationName(conversationId),
      isPlaceholder: true,
    };
  }

  // 3. Normalize questions/filler into topic phrases
  cleaned = normalizeQuestionToTopic(cleaned);

  // 4. Convert to Title Case
  cleaned = toTitleCase(cleaned);

  // 5. Optional project prefix (only if requested and not already present)
  if (includeRepoPrefix && !hasProjectPrefix(cleaned)) {
    const prefix = extractRepoName(selectedRepository);
    if (prefix) {
      cleaned = `${prefix}: ${cleaned}`;
    }
  }

  // 6. Enforce max length cleanly
  if (cleaned.length > MAX_TITLE_LENGTH) {
    const sliced = cleaned.slice(0, MAX_TITLE_LENGTH - 1);
    const lastSpace = sliced.lastIndexOf(" ");
    cleaned = lastSpace > 20 ? `${sliced.slice(0, lastSpace)}…` : `${sliced}…`;
  }

  return {
    title: cleaned,
    isPlaceholder: false,
  };
}

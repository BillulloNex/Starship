/**
 * Deterministic random conversation name generator.
 *
 * Produces fun `adjective-noun` placeholder names (like GitHub's auto-generated
 * repo names) from a mixed pool of tech, animal, and space/sci-fi words.
 *
 * The same conversation ID always produces the same name (hash-based).
 */

const ADJECTIVES = [
  // Tech
  "fuzzy",
  "brave",
  "cosmic",
  "silent",
  "rogue",
  "phantom",
  "turbo",
  "lazy",
  "stealth",
  "atomic",
  // Animals
  "fluffy",
  "sturdy",
  "curly",
  "mighty",
  "sneaky",
  "bold",
  "swift",
  "clever",
  "nimble",
  "wild",
  // Space/sci-fi
  "stellar",
  "quantum",
  "lunar",
  "solar",
  "neon",
  "cyber",
  "orbital",
  "hyper",
  "plasma",
  "astral",
] as const;

const NOUNS = [
  // Tech
  "compiler",
  "debugger",
  "refactor",
  "deploy",
  "linter",
  "parser",
  "rebase",
  "daemon",
  "kernel",
  "cipher",
  // Animals
  "barnacle",
  "octopus",
  "falcon",
  "penguin",
  "pangolin",
  "narwhal",
  "mantis",
  "otter",
  "badger",
  "condor",
  // Space/sci-fi
  "echo",
  "drift",
  "pulse",
  "walker",
  "surge",
  "beacon",
  "nova",
  "vortex",
  "comet",
  "nebula",
] as const;

/**
 * Simple string hash that produces a positive integer.
 * Deterministic: same input always yields the same output.
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Generate a deterministic random conversation name from a conversation ID.
 *
 * @example
 * generateRandomConversationName("abc-123") // "cosmic-falcon"
 * generateRandomConversationName("abc-123") // "cosmic-falcon" (same input = same output)
 * generateRandomConversationName("xyz-789") // "bold-vortex"   (different input = different output)
 */
export function generateRandomConversationName(
  conversationId: string,
): string {
  const hash = simpleHash(conversationId);
  const adjective = ADJECTIVES[hash % ADJECTIVES.length];
  // Use a different slice of the hash for the noun to reduce correlation
  const noun = NOUNS[Math.floor(hash / ADJECTIVES.length) % NOUNS.length];
  return `${adjective}-${noun}`;
}

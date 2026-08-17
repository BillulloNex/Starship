import { describe, it, expect } from "vitest";
import {
  processConversationTitle,
  extractRepoName,
  stripEmojis,
  cleanPunctuation,
  normalizeQuestionToTopic,
  toTitleCase,
} from "#/utils/process-conversation-title";

describe("extractRepoName", () => {
  it("extracts repo name from org/repo format", () => {
    expect(extractRepoName("ThomasVuNguyen/GrokBot")).toBe("GrokBot");
  });

  it("returns the string itself when no slash", () => {
    expect(extractRepoName("my-repo")).toBe("my-repo");
  });

  it("returns null for null", () => {
    expect(extractRepoName(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(extractRepoName(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractRepoName("")).toBeNull();
  });

  it("handles deeply nested paths", () => {
    expect(extractRepoName("org/sub/repo")).toBe("repo");
  });
});

describe("stripEmojis", () => {
  it("strips single emoji at start", () => {
    expect(stripEmojis("🚀 Deploy").trim()).toBe("Deploy");
  });

  it("strips sparkle emoji", () => {
    expect(stripEmojis("✨ Greeting").trim()).toBe("Greeting");
  });

  it("strips multiple emojis", () => {
    expect(stripEmojis("🔥🚀 Hot deploy").trim()).toBe("Hot deploy");
  });

  it("strips test tube emoji", () => {
    expect(stripEmojis("🧪 Chemical Formula for Water").trim()).toBe(
      "Chemical Formula for Water",
    );
  });

  it("strips emoji in middle of text", () => {
    expect(stripEmojis("Fix 🐛 bug").trim()).toBe("Fix bug");
  });

  it("returns plain text unchanged", () => {
    expect(stripEmojis("Fix login bug")).toBe("Fix login bug");
  });

  it("handles empty string", () => {
    expect(stripEmojis("")).toBe("");
  });
});

describe("cleanPunctuation", () => {
  it("strips markdown headers and trailing punctuation", () => {
    expect(cleanPunctuation("### Who is the president?")).toBe(
      "Who is the president",
    );
    expect(cleanPunctuation('"Fix the bug!"')).toBe("Fix the bug");
    expect(cleanPunctuation("`test title`")).toBe("test title");
  });
});

describe("normalizeQuestionToTopic", () => {
  it("converts 'Who is X?' questions to 'X Overview'", () => {
    expect(normalizeQuestionToTopic("Who is the current president")).toBe(
      "current president Overview",
    );
    expect(normalizeQuestionToTopic("Who is Joe Biden")).toBe(
      "Joe Biden Overview",
    );
    expect(normalizeQuestionToTopic("Who is Joe Biden? Overview")).toBe(
      "Joe Biden Overview",
    );
  });

  it("converts chemical formula questions", () => {
    expect(
      normalizeQuestionToTopic("What is the chemical formula for water"),
    ).toBe("chemical formula for water");
  });

  it("converts 'How to / How do I' questions", () => {
    expect(normalizeQuestionToTopic("How to optimize Claude Code")).toBe(
      "optimize Claude Code",
    );
    expect(normalizeQuestionToTopic("How do I track LLM usage")).toBe(
      "track LLM usage",
    );
  });

  it("converts 'Explain X' queries", () => {
    expect(normalizeQuestionToTopic("Explain fork functionality")).toBe(
      "fork functionality Explanation",
    );
  });
});

describe("toTitleCase", () => {
  it("capitalizes words and preserves minor words", () => {
    expect(toTitleCase("available UI color themes")).toBe(
      "Available UI Color Themes",
    );
    expect(toTitleCase("optimizing claude code integration")).toBe(
      "Optimizing Claude Code Integration",
    );
    expect(toTitleCase("tracking llm usage statistics")).toBe(
      "Tracking LLM Usage Statistics",
    );
  });

  it("preserves tech acronyms and brand names", () => {
    expect(toTitleCase("grokbot vs openhands in docker")).toBe(
      "GrokBot vs OpenHands in Docker",
    );
    expect(toTitleCase("rest api and ui for saas")).toBe(
      "REST API and UI for SaaS",
    );
    expect(toTitleCase("ci/cd pipeline sdk")).toBe("CI/CD Pipeline SDK");
  });
});

describe("processConversationTitle", () => {
  it("returns default placeholder for null title", () => {
    const result = processConversationTitle(null, "abc-123", "org/repo");
    expect(result.isPlaceholder).toBe(true);
    expect(result.title).toBe("New Conversation");
  });

  it("returns default placeholder for empty title", () => {
    const result = processConversationTitle("", "abc-123", "org/repo");
    expect(result.isPlaceholder).toBe(true);
    expect(result.title).toBe("New Conversation");
  });

  it("returns default placeholder for whitespace-only title", () => {
    const result = processConversationTitle("   ", "abc-123", null);
    expect(result.isPlaceholder).toBe(true);
    expect(result.title).toBe("New Conversation");
  });

  it("strips emojis and transforms question to Title Case noun phrase", () => {
    const result = processConversationTitle(
      "🧪 Chemical Formula for Water",
      "abc-123",
      "ThomasVuNguyen/GrokBot",
    );
    expect(result.isPlaceholder).toBe(false);
    expect(result.title).toBe("Chemical Formula for Water");
  });

  it("converts 'Who is the current president?' to 'Current President Overview'", () => {
    const result = processConversationTitle(
      "Who is the current president?",
      "abc-123",
      null,
    );
    expect(result.isPlaceholder).toBe(false);
    expect(result.title).toBe("Current President Overview");
  });

  it("converts 'Who is Joe Biden? Overview' cleanly without double Overview", () => {
    const result = processConversationTitle(
      "Who Is Joe Biden? Overview",
      "abc-123",
      null,
    );
    expect(result.isPlaceholder).toBe(false);
    expect(result.title).toBe("Joe Biden Overview");
  });

  it("formats action requests like Antigravity", () => {
    const result = processConversationTitle(
      "optimizing claude code integration",
      "abc-123",
      null,
    );
    expect(result.title).toBe("Optimizing Claude Code Integration");
  });

  it("enforces max length cleanly", () => {
    const longTitle =
      "This is a very long conversation title that definitely exceeds the fifty character limit for display";
    const result = processConversationTitle(longTitle, "abc-123");
    expect(result.title.length).toBeLessThanOrEqual(55);
    expect(result.title).toContain("…");
  });

  it("returns placeholder when emojis are the entire title", () => {
    const result = processConversationTitle("🚀✨🔥", "abc-123", null);
    expect(result.isPlaceholder).toBe(true);
    expect(result.title).toBe("New Conversation");
  });
});

import { describe, it, expect } from "vitest";
import {
  processConversationTitle,
  extractRepoName,
  stripEmojis,
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
    expect(stripEmojis("🚀 Deploy")).toBe(" Deploy");
  });

  it("strips sparkle emoji", () => {
    expect(stripEmojis("✨ Greeting")).toBe(" Greeting");
  });

  it("strips multiple emojis", () => {
    expect(stripEmojis("🔥🚀 Hot deploy")).toBe(" Hot deploy");
  });

  it("strips emoji in middle of text", () => {
    expect(stripEmojis("Fix 🐛 bug")).toBe("Fix  bug");
  });

  it("returns plain text unchanged", () => {
    expect(stripEmojis("Fix login bug")).toBe("Fix login bug");
  });

  it("handles empty string", () => {
    expect(stripEmojis("")).toBe("");
  });
});

describe("processConversationTitle", () => {
  it("returns random placeholder for null title", () => {
    const result = processConversationTitle(null, "abc-123", "org/repo");
    expect(result.isPlaceholder).toBe(true);
    expect(result.title).toMatch(/^[a-z]+-[a-z]+$/);
  });

  it("returns random placeholder for empty title", () => {
    const result = processConversationTitle("", "abc-123", "org/repo");
    expect(result.isPlaceholder).toBe(true);
    expect(result.title).toMatch(/^[a-z]+-[a-z]+$/);
  });

  it("returns random placeholder for whitespace-only title", () => {
    const result = processConversationTitle("   ", "abc-123", null);
    expect(result.isPlaceholder).toBe(true);
  });

  it("placeholder has no project prefix", () => {
    const result = processConversationTitle(null, "abc-123", "org/repo");
    expect(result.title).not.toContain(":");
  });

  it("strips emojis and adds project prefix", () => {
    const result = processConversationTitle(
      "✨ Casual greeting",
      "abc-123",
      "ThomasVuNguyen/GrokBot",
    );
    expect(result.isPlaceholder).toBe(false);
    expect(result.title).toBe("GrokBot: Casual greeting");
  });

  it("does not add a prefix when no repo is attached", () => {
    const result = processConversationTitle(
      "Deploy to production",
      "abc-123",
      null,
    );
    expect(result.isPlaceholder).toBe(false);
    expect(result.title).toBe("Deploy to production");
  });

  it("enforces 50-char max with ellipsis", () => {
    const longTitle =
      "This is a very long conversation title that definitely exceeds the fifty character limit";
    const result = processConversationTitle(longTitle, "abc-123", "org/repo");
    expect(result.title.length).toBeLessThanOrEqual(50);
    expect(result.title).toContain("…");
  });

  it("does not truncate short titles", () => {
    const result = processConversationTitle(
      "Fix bug",
      "abc-123",
      "org/repo",
    );
    expect(result.title).toBe("repo: Fix bug");
    expect(result.title).not.toContain("…");
  });

  it("is idempotent — does not double-prefix", () => {
    const result1 = processConversationTitle(
      "Fix login bug",
      "abc-123",
      "org/GrokBot",
    );
    expect(result1.title).toBe("GrokBot: Fix login bug");

    // Processing the already-processed title should not add another prefix
    const result2 = processConversationTitle(
      "GrokBot: Fix login bug",
      "abc-123",
      "org/GrokBot",
    );
    expect(result2.title).toBe("GrokBot: Fix login bug");
  });

  it("returns random name when emojis are the entire title", () => {
    const result = processConversationTitle("🚀✨🔥", "abc-123", null);
    expect(result.isPlaceholder).toBe(true);
    expect(result.title).toMatch(/^[a-z]+-[a-z]+$/);
  });

  it("produces deterministic placeholder for same conversation ID", () => {
    const result1 = processConversationTitle(null, "same-id", null);
    const result2 = processConversationTitle(null, "same-id", null);
    expect(result1.title).toBe(result2.title);
  });
});

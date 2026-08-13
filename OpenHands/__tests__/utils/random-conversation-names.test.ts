import { describe, it, expect } from "vitest";
import { generateRandomConversationName } from "#/utils/random-conversation-names";

describe("generateRandomConversationName", () => {
  it("produces the same name for the same conversation ID (deterministic)", () => {
    const name1 = generateRandomConversationName("abc-123-def-456");
    const name2 = generateRandomConversationName("abc-123-def-456");
    expect(name1).toBe(name2);
  });

  it("produces different names for different conversation IDs", () => {
    const ids = [
      "aaa-111",
      "bbb-222",
      "ccc-333",
      "ddd-444",
      "eee-555",
      "fff-666",
      "ggg-777",
      "hhh-888",
    ];
    const names = ids.map(generateRandomConversationName);
    const unique = new Set(names);
    // With 8 different IDs, we should get at least 4 unique names
    // (hash collisions are possible but unlikely with this many inputs)
    expect(unique.size).toBeGreaterThanOrEqual(4);
  });

  it("always produces adjective-noun format", () => {
    const testIds = [
      "test-1",
      "test-2",
      "372eb-1234-5678-9abc",
      "",
      "a",
      "very-long-conversation-id-that-goes-on-and-on-and-on",
    ];
    for (const id of testIds) {
      const name = generateRandomConversationName(id);
      expect(name).toMatch(/^[a-z]+-[a-z]+$/);
    }
  });

  it("handles empty string ID without crashing", () => {
    expect(() => generateRandomConversationName("")).not.toThrow();
    const name = generateRandomConversationName("");
    expect(name).toBeTruthy();
    expect(name).toMatch(/^[a-z]+-[a-z]+$/);
  });

  it("handles special characters in ID", () => {
    const name = generateRandomConversationName("!@#$%^&*()");
    expect(name).toMatch(/^[a-z]+-[a-z]+$/);
  });
});

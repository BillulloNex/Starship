import { describe, it, expect } from "vitest";
import {
  generateRandomConversationName,
  DEFAULT_CONVERSATION_NAME,
} from "#/utils/random-conversation-names";

describe("generateRandomConversationName", () => {
  it("returns default conversation name", () => {
    const name = generateRandomConversationName("abc-123-def-456");
    expect(name).toBe(DEFAULT_CONVERSATION_NAME);
    expect(name).toBe("New Conversation");
  });

  it("handles empty string and special characters without crashing", () => {
    expect(() => generateRandomConversationName("")).not.toThrow();
    expect(generateRandomConversationName("")).toBe("New Conversation");
    expect(generateRandomConversationName("!@#$%^&*()")).toBe("New Conversation");
  });
});

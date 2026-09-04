import { describe, expect, it } from "vitest";
import {
  getFavoriteAgentModelsKey,
  sanitizeFavoriteAgentModels,
} from "./use-favorite-agent-models";

describe("favorite agent models storage", () => {
  it("scopes favorites by backend and organization", () => {
    expect(getFavoriteAgentModelsKey("local", null)).toBe(
      "oh:favorite-agent-models:local:-",
    );
    expect(getFavoriteAgentModelsKey("cloud", "org-1")).toBe(
      "oh:favorite-agent-models:cloud:org-1",
    );
  });

  it("preserves order while dropping malformed and duplicate entries", () => {
    expect(
      sanitizeFavoriteAgentModels([
        { agentProfileId: "codex", modelId: "gpt-5.6" },
        null,
        { agentProfileId: "claude", modelId: "opus" },
        { agentProfileId: "codex", modelId: "gpt-5.6" },
        { agentProfileId: "" },
        { agentProfileId: "bad", modelId: 4 },
      ]),
    ).toEqual([
      { agentProfileId: "codex", modelId: "gpt-5.6" },
      { agentProfileId: "claude", modelId: "opus" },
    ]);
  });
});

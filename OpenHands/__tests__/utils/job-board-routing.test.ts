import { describe, expect, it } from "vitest";
import {
  pickProfileForQuota,
  profileMatchesProvider,
} from "#/utils/job-board-routing";

describe("job-board-routing", () => {
  it("matches Claude fuel to a claude-code profile", () => {
    expect(
      profileMatchesProvider(
        { id: "p1", name: "Claude Pro", agent_kind: "acp", acp_server: "claude-code" },
        { providerId: "claude-code", displayName: "Claude", status: "available" },
      ),
    ).toBe(true);
  });

  it("picks the first available provider that has a matching profile", () => {
    const picked = pickProfileForQuota(
      [
        { id: "codex", name: "Codex", acp_server: "codex" },
        { id: "claude", name: "Claude", acp_server: "claude-code" },
      ],
      [
        { providerId: "codex", displayName: "ChatGPT", status: "exhausted" },
        { providerId: "claude-code", displayName: "Claude", status: "available" },
      ],
    );
    expect(picked?.id).toBe("claude");
  });

  it("returns null when nobody still has quota", () => {
    expect(
      pickProfileForQuota(
        [{ id: "codex", name: "Codex", acp_server: "codex" }],
        [{ providerId: "codex", displayName: "ChatGPT", status: "exhausted" }],
      ),
    ).toBeNull();
  });
});

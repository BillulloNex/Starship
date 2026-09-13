import { beforeEach, describe, expect, it } from "vitest";
import { useIdeViewStore } from "#/stores/ide-view-store";

describe("useIdeViewStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useIdeViewStore.setState({ viewMode: "agent" });
  });

  it("toggles between agent and IDE views", () => {
    useIdeViewStore.getState().toggleViewMode();
    expect(useIdeViewStore.getState().viewMode).toBe("ide");
    useIdeViewStore.getState().toggleViewMode();
    expect(useIdeViewStore.getState().viewMode).toBe("agent");
  });

  it("remembers the chosen view across reloads", () => {
    useIdeViewStore.getState().setViewMode("ide");
    const stored = JSON.parse(localStorage.getItem("grokbot-ide-view") ?? "{}");
    expect(stored.state).toEqual({ viewMode: "ide" });
  });
});

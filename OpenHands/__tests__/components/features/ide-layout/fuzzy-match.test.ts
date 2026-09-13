import { describe, expect, it } from "vitest";
import {
  fuzzyMatch,
  rankFuzzy,
} from "#/components/features/ide-layout/workbench/fuzzy-match";

describe("fuzzyMatch", () => {
  it("matches characters in order, case-insensitively", () => {
    expect(fuzzyMatch("wfb", "src/workspace-file-browser.tsx")).not.toBeNull();
    expect(fuzzyMatch("WFB", "src/workspace-file-browser.tsx")).not.toBeNull();
    expect(fuzzyMatch("bfw", "src/workspace-file-browser.tsx")).toBeNull();
  });

  it("returns the matched positions", () => {
    const match = fuzzyMatch("abc", "a-b-c");
    expect(match?.positions).toEqual([0, 2, 4]);
  });

  it("prefers word starts over earlier mid-word characters", () => {
    const match = fuzzyMatch("fb", "src/refactor-file-browser.ts");
    const target = "src/refactor-file-browser.ts";
    expect(match?.positions.map((p) => target[p])).toEqual(["f", "b"]);
    expect(match?.positions[0]).toBe(target.indexOf("file"));
  });

  it("treats an empty query as a neutral match", () => {
    expect(fuzzyMatch("  ", "anything")).toEqual({ score: 0, positions: [] });
  });

  it("ignores spaces in the query", () => {
    expect(fuzzyMatch("ide layout", "src/ide-layout.tsx")).not.toBeNull();
  });
});

describe("rankFuzzy", () => {
  const files = [
    "src/components/features/ide-layout/ide-layout.tsx",
    "src/components/features/ide-layout/view-mode-toggle.tsx",
    "docs/guide/identity-and-layout-notes.md",
    "src/hooks/use-ide-view-shortcut.ts",
  ];

  it("ranks basename matches above scattered path matches", () => {
    const ranked = rankFuzzy("idelayout", files, (f) => f);
    expect(ranked[0].item).toBe(
      "src/components/features/ide-layout/ide-layout.tsx",
    );
  });

  it("drops non-matches and respects the limit", () => {
    expect(rankFuzzy("zzz", files, (f) => f)).toEqual([]);
    expect(rankFuzzy("s", files, (f) => f, 2)).toHaveLength(2);
  });

  it("prefers shorter targets on equal matches", () => {
    const ranked = rankFuzzy(
      "readme",
      ["a/b/README.md", "README.md"],
      (f) => f,
    );
    expect(ranked[0].item).toBe("README.md");
  });
});

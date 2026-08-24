import { describe, expect, it } from "vitest";
import { toWorkspaceRelativePath } from "#/utils/workspace-relative-path";

describe("toWorkspaceRelativePath", () => {
  it("strips the conversation working directory prefix from absolute paths", () => {
    expect(
      toWorkspaceRelativePath(
        "/workspace/project/report.md",
        "/workspace/project",
      ),
    ).toBe("report.md");
    expect(
      toWorkspaceRelativePath(
        "/workspace/project/src/index.ts",
        "/workspace/project",
      ),
    ).toBe("src/index.ts");
  });

  it("leaves already-relative paths unchanged", () => {
    expect(toWorkspaceRelativePath("canvas.md", "/workspace/project")).toBe(
      "canvas.md",
    );
    expect(toWorkspaceRelativePath("./docs/a.md", "/workspace/project")).toBe(
      "docs/a.md",
    );
  });

  it("falls back to DEFAULT_WORKING_DIR when workingDir is omitted", () => {
    expect(toWorkspaceRelativePath("/workspace/project/canvas.md")).toBe(
      "canvas.md",
    );
  });

  it("handles full sandbox container paths with project hash or home prefixes", () => {
    expect(
      toWorkspaceRelativePath(
        "/home/openhands/workspace/project/c40017ff3612407db2a9537113a57c2a/ghost-peekaboo-a1.png",
      ),
    ).toBe("ghost-peekaboo-a1.png");
    expect(
      toWorkspaceRelativePath(
        "/workspace/project/c40017ff3612407db2a9537113a57c2a/assets/ghost.png",
      ),
    ).toBe("assets/ghost.png");
    expect(
      toWorkspaceRelativePath("/home/openhands/workspace/docs/guide.md"),
    ).toBe("docs/guide.md");
  });
});

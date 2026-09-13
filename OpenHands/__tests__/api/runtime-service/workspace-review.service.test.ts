import { describe, expect, it } from "vitest";
import { parseListOutput } from "#/api/runtime-service/workspace-review.service";

const NUL = String.fromCharCode(0);

describe("parseListOutput", () => {
  it("reports workspaces outside git", () => {
    expect(parseListOutput("__GROKBOT_NOT_A_REPOSITORY__")).toEqual({
      isRepository: false,
      changes: [],
    });
  });

  it("lists unstaged changes relative to the workspace directory", () => {
    const stdout = [
      "__GROKBOT_PREFIX__:app/",
      " M app/src/main.ts",
      "?? app/new file.ts",
      " D app/old.ts",
      "M  app/staged-only.ts",
      "MM app/staged-and-edited.ts",
      "R  app/renamed.ts",
      "app/was-named.ts",
      "",
    ].join(NUL);

    expect(parseListOutput(stdout)).toEqual({
      isRepository: true,
      changes: [
        { path: "new file.ts", kind: "added" },
        { path: "old.ts", kind: "deleted" },
        { path: "src/main.ts", kind: "modified" },
        { path: "staged-and-edited.ts", kind: "modified" },
      ],
    });
  });

  it("works at the repository root", () => {
    expect(
      parseListOutput(["__GROKBOT_PREFIX__:", " M README.md", ""].join(NUL)),
    ).toEqual({
      isRepository: true,
      changes: [{ path: "README.md", kind: "modified" }],
    });
  });
});

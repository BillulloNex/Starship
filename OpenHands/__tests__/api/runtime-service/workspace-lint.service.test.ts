import { describe, expect, it } from "vitest";
import {
  buildLintCommand,
  lintToolFor,
  parseLintOutput,
} from "#/api/runtime-service/workspace-lint.service";

describe("lintToolFor", () => {
  it("picks ESLint for JS/TS and Ruff for Python", () => {
    expect(lintToolFor("src/a.tsx")).toBe("eslint");
    expect(lintToolFor("src/a.mjs")).toBe("eslint");
    expect(lintToolFor("app/main.py")).toBe("ruff");
    expect(lintToolFor("README.md")).toBeNull();
  });
});

describe("buildLintCommand", () => {
  it("only runs tools the project already has", () => {
    const eslint = buildLintCommand("src/a.ts")!;
    expect(eslint).toContain('[ -x "$D/node_modules/.bin/eslint" ] || exit 0');
    expect(eslint).not.toContain("npx");
    const ruff = buildLintCommand("a.py")!;
    expect(ruff).toContain("command -v ruff >/dev/null 2>&1 || exit 0");
  });

  it("never puts the path on the command line raw", () => {
    const command = buildLintCommand("src/$(rm -rf ~).ts")!;
    expect(command).not.toContain("rm -rf");
  });
});

describe("parseLintOutput", () => {
  it("returns null when the tool isn't installed", () => {
    expect(parseLintOutput("eslint", "")).toBeNull();
  });

  it("parses ESLint results, skipping messages without a rule", () => {
    const stdout = `__GROKBOT_LINT__:${JSON.stringify([
      {
        filePath: "/w/src/a.ts",
        messages: [
          {
            ruleId: "no-unused-vars",
            severity: 2,
            message: "'x' is defined but never used.",
            line: 3,
            column: 7,
            endLine: 3,
            endColumn: 8,
          },
          {
            ruleId: "eqeqeq",
            severity: 1,
            message: "Use ===",
            line: 9,
            column: 5,
          },
          { ruleId: null, severity: 1, message: "File ignored" },
        ],
      },
    ])}`;
    expect(parseLintOutput("eslint", stdout)).toEqual([
      {
        source: "eslint",
        severity: "error",
        message: "'x' is defined but never used.",
        code: "no-unused-vars",
        line: 3,
        column: 7,
        endLine: 3,
        endColumn: 8,
      },
      {
        source: "eslint",
        severity: "warning",
        message: "Use ===",
        code: "eqeqeq",
        line: 9,
        column: 5,
        endLine: 9,
        endColumn: 6,
      },
    ]);
  });

  it("parses Ruff results", () => {
    const stdout = `__GROKBOT_LINT__:${JSON.stringify([
      {
        code: "F401",
        message: "`os` imported but unused",
        location: { row: 1, column: 8 },
        end_location: { row: 1, column: 10 },
      },
    ])}`;
    expect(parseLintOutput("ruff", stdout)).toEqual([
      {
        source: "ruff",
        severity: "warning",
        message: "`os` imported but unused",
        code: "F401",
        line: 1,
        column: 8,
        endLine: 1,
        endColumn: 10,
      },
    ]);
  });

  it("treats unparseable output as no problems", () => {
    expect(parseLintOutput("eslint", "__GROKBOT_LINT__:Oops")).toEqual([]);
  });
});

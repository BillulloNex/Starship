import { describe, expect, it } from "vitest";
import {
  buildSearchCommand,
  parseSearchOutput,
  SEARCH_RESULT_LIMIT,
} from "#/api/runtime-service/workspace-search.service";

const literal = {
  query: "Button",
  isRegex: false,
  matchCase: false,
  wholeWord: false,
};

const NUL = "\u0000";

describe("buildSearchCommand", () => {
  it("never puts the raw query on the command line", () => {
    const command = buildSearchCommand({
      ...literal,
      query: `'; rm -rf / #"$(whoami)`,
    });
    expect(command).not.toContain("rm -rf");
    expect(command).not.toContain("whoami");
    expect(command).toContain("base64 -d");
  });

  it("prefers ripgrep and falls back to grep with matching options", () => {
    const command = buildSearchCommand({
      query: "a.b",
      isRegex: true,
      matchCase: true,
      wholeWord: true,
    });
    expect(command).toMatch(/command -v rg .* then rg .* -s -w -e "\$Q"/);
    expect(command).toMatch(/else grep -rnI .* -E -w -e "\$Q"/);
    expect(command).not.toMatch(/rg [^;]* -F /);
  });

  it("searches literally and case-insensitively by default", () => {
    const command = buildSearchCommand(literal);
    expect(command).toMatch(/rg .* -i -F/);
    expect(command).toMatch(/grep .* -i -F/);
  });

  it("skips heavy directories and caps output", () => {
    const command = buildSearchCommand(literal);
    expect(command).toContain("-g '!node_modules'");
    expect(command).toContain("--exclude-dir='node_modules'");
    expect(command).toContain(`head -n ${SEARCH_RESULT_LIMIT + 1}`);
  });
});

describe("parseSearchOutput", () => {
  it("parses NUL-separated paths and locates the match column", () => {
    const stdout = [
      `./src/app.tsx${NUL}2:import { Button } from './button';`,
      `src/components/button.tsx${NUL}1:export function Button() {}`,
      "",
    ].join("\n");
    expect(parseSearchOutput(stdout, literal)).toEqual({
      truncated: false,
      matches: [
        {
          path: "src/app.tsx",
          line: 2,
          column: 10,
          length: 6,
          text: "import { Button } from './button';",
        },
        {
          path: "src/components/button.tsx",
          line: 1,
          column: 17,
          length: 6,
          text: "export function Button() {}",
        },
      ],
    });
  });

  it("keeps colons in paths and text intact", () => {
    const { matches } = parseSearchOutput(
      `docs/a:b.md${NUL}12:key: value: Button\r`,
      literal,
    );
    expect(matches[0]).toMatchObject({
      path: "docs/a:b.md",
      line: 12,
      text: "key: value: Button",
    });
  });

  it("honours regex, case, and whole-word options when locating matches", () => {
    const line = `src/a.ts${NUL}1:buttons Button setCount`;
    expect(
      parseSearchOutput(line, { ...literal, matchCase: true }).matches[0]
        .column,
    ).toBe(9);
    expect(
      parseSearchOutput(line, { ...literal, wholeWord: true }).matches[0]
        .column,
    ).toBe(9);
    expect(
      parseSearchOutput(line, {
        ...literal,
        query: "set[A-Z]\\w+",
        isRegex: true,
      }).matches[0],
    ).toMatchObject({ column: 16, length: 8 });
  });

  it("flags truncated output", () => {
    const stdout = Array.from(
      { length: SEARCH_RESULT_LIMIT + 1 },
      (_, i) => `f.ts${NUL}${i + 1}:Button`,
    ).join("\n");
    const result = parseSearchOutput(stdout, literal);
    expect(result.truncated).toBe(true);
    expect(result.matches).toHaveLength(SEARCH_RESULT_LIMIT);
  });

  it("survives an invalid regex", () => {
    const { matches } = parseSearchOutput(`f.ts${NUL}1:a(b`, {
      ...literal,
      query: "a(",
      isRegex: true,
    });
    expect(matches[0]).toMatchObject({ column: 1, length: 0 });
  });
});

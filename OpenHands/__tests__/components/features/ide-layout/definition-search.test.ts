import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildDefinitionPattern,
  rankDefinitions,
} from "#/components/features/ide-layout/workbench/definition-search";

function grepMatches(pattern: string, lines: string[]): string[] {
  const dir = mkdtempSync(path.join(tmpdir(), "grokbot-def-"));
  const file = path.join(dir, "sample.txt");
  writeFileSync(file, `${lines.join("\n")}\n`);
  try {
    return execFileSync("grep", ["-E", "-e", pattern, file])
      .toString()
      .trim()
      .split("\n");
  } catch {
    return [];
  }
}

describe("buildDefinitionPattern", () => {
  it("rejects anything that isn't an identifier", () => {
    expect(buildDefinitionPattern("a b")).toBeNull();
    expect(buildDefinitionPattern("$(x)")).toBeNull();
  });

  it("finds declarations but not uses, with grep -E", () => {
    const lines = [
      "export function Button(props) {",
      "export const Button = styled.button``;",
      "class Button extends Component {}",
      "interface ButtonProps {}",
      "def Button(self):",
      "func (s *Server) Button(w http.ResponseWriter) {",
      "fn Button() -> Self {",
      "<Button onClick={go} />",
      "import { Button } from './button';",
      "const ButtonGroup = () => null;",
    ];
    const matches = grepMatches(buildDefinitionPattern("Button")!, lines);
    expect(matches).toEqual(
      lines.slice(0, 7).filter((l) => !l.startsWith("interface")),
    );
  });
});

describe("rankDefinitions", () => {
  it("prefers the current file, then source over tests and type stubs", () => {
    const ranked = rankDefinitions(
      [
        { path: "types/button.d.ts", line: 1, text: "" },
        { path: "src/__tests__/button.test.tsx", line: 1, text: "" },
        { path: "src/components/button.tsx", line: 4, text: "" },
        { path: "src/app.tsx", line: 20, text: "" },
      ],
      "src/app.tsx",
    );
    expect(ranked.map((r) => r.path)).toEqual([
      "src/app.tsx",
      "src/components/button.tsx",
      "types/button.d.ts",
      "src/__tests__/button.test.tsx",
    ]);
  });
});

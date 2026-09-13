import { describe, expect, it } from "vitest";
import { computeMinimalEdit } from "#/components/features/ide-layout/workbench/text-diff";

function apply(oldText: string, newText: string) {
  const edit = computeMinimalEdit(oldText, newText);
  if (!edit) return oldText;
  return oldText.slice(0, edit.start) + edit.text + oldText.slice(edit.end);
}

describe("computeMinimalEdit", () => {
  it("returns null for identical text", () => {
    expect(computeMinimalEdit("same", "same")).toBeNull();
  });

  it("replaces only the changed middle", () => {
    expect(computeMinimalEdit("const a = 1;\n", "const a = 2;\n")).toEqual({
      start: 10,
      end: 11,
      text: "2",
    });
  });

  it("handles insertions and deletions at either end", () => {
    const cases: [string, string][] = [
      ["abc", "xabc"],
      ["abc", "abcx"],
      ["xabc", "abc"],
      ["abcx", "abc"],
      ["", "new file"],
      ["old file", ""],
      ["aaaa", "aa"],
    ];
    cases.forEach(([before, after]) => {
      expect(apply(before, after)).toBe(after);
    });
  });

  it("never splits a surrogate pair", () => {
    const before = "x😀y";
    const after = "x😃y";
    const edit = computeMinimalEdit(before, after)!;
    expect(edit.text).toBe("😃");
    expect(apply(before, after)).toBe(after);
  });
});

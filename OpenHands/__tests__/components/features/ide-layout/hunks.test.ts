import { describe, expect, it } from "vitest";
import {
  acceptLineChange,
  findChangeIndex,
  rejectLineChange,
} from "#/components/features/ide-layout/review/hunks";

const original = ["a", "b", "c", "d", ""].join("\n");

describe("line change helpers", () => {
  it("accepts and rejects a modification", () => {
    const modified = ["a", "B!", "c", "d", ""].join("\n");
    const change = {
      originalStartLineNumber: 2,
      originalEndLineNumber: 2,
      modifiedStartLineNumber: 2,
      modifiedEndLineNumber: 2,
    };
    expect(acceptLineChange(original, modified, change)).toBe(modified);
    expect(rejectLineChange(original, modified, change)).toBe(original);
  });

  it("accepts and rejects an insertion", () => {
    const modified = ["a", "b", "x", "y", "c", "d", ""].join("\n");
    const change = {
      originalStartLineNumber: 2,
      originalEndLineNumber: 0,
      modifiedStartLineNumber: 3,
      modifiedEndLineNumber: 4,
    };
    expect(acceptLineChange(original, modified, change)).toBe(modified);
    expect(rejectLineChange(original, modified, change)).toBe(original);
  });

  it("accepts and rejects a deletion", () => {
    const modified = ["a", "d", ""].join("\n");
    const change = {
      originalStartLineNumber: 2,
      originalEndLineNumber: 3,
      modifiedStartLineNumber: 1,
      modifiedEndLineNumber: 0,
    };
    expect(acceptLineChange(original, modified, change)).toBe(modified);
    expect(rejectLineChange(original, modified, change)).toBe(original);
  });

  it("handles an insertion at the very top", () => {
    const modified = ["top", "a", "b", "c", "d", ""].join("\n");
    const change = {
      originalStartLineNumber: 0,
      originalEndLineNumber: 0,
      modifiedStartLineNumber: 1,
      modifiedEndLineNumber: 1,
    };
    expect(acceptLineChange(original, modified, change)).toBe(modified);
    expect(rejectLineChange(original, modified, change)).toBe(original);
  });

  it("applies one change of several independently", () => {
    const modified = ["A", "b", "c", "D", ""].join("\n");
    const first = {
      originalStartLineNumber: 1,
      originalEndLineNumber: 1,
      modifiedStartLineNumber: 1,
      modifiedEndLineNumber: 1,
    };
    expect(acceptLineChange(original, modified, first)).toBe(
      ["A", "b", "c", "d", ""].join("\n"),
    );
    expect(rejectLineChange(original, modified, first)).toBe(
      ["a", "b", "c", "D", ""].join("\n"),
    );
  });

  it("finds the change at or after a line", () => {
    const changes = [
      {
        originalStartLineNumber: 1,
        originalEndLineNumber: 1,
        modifiedStartLineNumber: 1,
        modifiedEndLineNumber: 2,
      },
      {
        originalStartLineNumber: 5,
        originalEndLineNumber: 0,
        modifiedStartLineNumber: 7,
        modifiedEndLineNumber: 8,
      },
      {
        originalStartLineNumber: 9,
        originalEndLineNumber: 10,
        modifiedStartLineNumber: 11,
        modifiedEndLineNumber: 0,
      },
    ];
    expect(findChangeIndex(changes, 2)).toBe(0);
    expect(findChangeIndex(changes, 3)).toBe(1);
    expect(findChangeIndex(changes, 11)).toBe(2);
    expect(findChangeIndex(changes, 40)).toBe(2);
  });
});

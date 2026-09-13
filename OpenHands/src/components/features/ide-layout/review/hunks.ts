/**
 * Monaco's `ILineChange`: 1-based inclusive line ranges. An end line of 0
 * means the side is empty and the start line is the line the change sits
 * after (0 = before the first line).
 */
export interface LineChange {
  originalStartLineNumber: number;
  originalEndLineNumber: number;
  modifiedStartLineNumber: number;
  modifiedEndLineNumber: number;
}

function takeLines(lines: string[], start: number, end: number): string[] {
  return end === 0 ? [] : lines.slice(start - 1, end);
}

function spliceLines(
  lines: string[],
  start: number,
  end: number,
  replacement: string[],
): string[] {
  const next = [...lines];
  if (end === 0) next.splice(start, 0, ...replacement);
  else next.splice(start - 1, end - start + 1, ...replacement);
  return next;
}

/** Applies one change to the original text (accepting it). */
export function acceptLineChange(
  original: string,
  modified: string,
  change: LineChange,
): string {
  const added = takeLines(
    modified.split("\n"),
    change.modifiedStartLineNumber,
    change.modifiedEndLineNumber,
  );
  return spliceLines(
    original.split("\n"),
    change.originalStartLineNumber,
    change.originalEndLineNumber,
    added,
  ).join("\n");
}

/** Undoes one change in the modified text (rejecting it). */
export function rejectLineChange(
  original: string,
  modified: string,
  change: LineChange,
): string {
  const restored = takeLines(
    original.split("\n"),
    change.originalStartLineNumber,
    change.originalEndLineNumber,
  );
  return spliceLines(
    modified.split("\n"),
    change.modifiedStartLineNumber,
    change.modifiedEndLineNumber,
    restored,
  ).join("\n");
}

/** Index of the change at `line` in the modified text, or the next one. */
export function findChangeIndex(changes: LineChange[], line: number): number {
  const index = changes.findIndex((change) => {
    const end = Math.max(
      change.modifiedEndLineNumber,
      change.modifiedStartLineNumber,
    );
    return line <= end;
  });
  return index === -1 ? changes.length - 1 : index;
}

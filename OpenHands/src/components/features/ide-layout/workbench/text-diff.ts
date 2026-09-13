export interface TextEdit {
  /** Start offset (UTF-16 code units) in the old text. */
  start: number;
  /** End offset (exclusive) in the old text. */
  end: number;
  /** Replacement text for `[start, end)`. */
  text: string;
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

/**
 * Returns the smallest single replacement that turns `oldText` into
 * `newText` by trimming their common prefix and suffix. Applying only the
 * changed middle keeps the cursor, selection, and scroll position intact
 * when a file is reloaded from disk.
 *
 * Returns `null` when the texts are identical.
 */
export function computeMinimalEdit(
  oldText: string,
  newText: string,
): TextEdit | null {
  if (oldText === newText) return null;

  const minLength = Math.min(oldText.length, newText.length);
  let start = 0;
  while (
    start < minLength &&
    oldText.charCodeAt(start) === newText.charCodeAt(start)
  ) {
    start += 1;
  }
  // Never split a surrogate pair.
  if (start > 0 && isHighSurrogate(oldText.charCodeAt(start - 1))) {
    start -= 1;
  }

  let oldEnd = oldText.length;
  let newEnd = newText.length;
  while (
    oldEnd > start &&
    newEnd > start &&
    oldText.charCodeAt(oldEnd - 1) === newText.charCodeAt(newEnd - 1)
  ) {
    oldEnd -= 1;
    newEnd -= 1;
  }
  if (oldEnd < oldText.length && isLowSurrogate(oldText.charCodeAt(oldEnd))) {
    oldEnd += 1;
    newEnd += 1;
  }

  return { start, end: oldEnd, text: newText.slice(start, newEnd) };
}

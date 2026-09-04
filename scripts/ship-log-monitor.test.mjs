import assert from "node:assert/strict";
import test from "node:test";

import { groupErrors } from "./ship-coolify-logs.test-utils.mjs";

test("groupErrors merges identical signatures and counts occurrences", () => {
  const windowStart = Date.now() - 24 * 60 * 60 * 1000;
  const lines = [
    { line: "2026-09-04T10:00:00Z ERROR auth failed for user abc123", timestamp: Date.parse("2026-09-04T10:00:00Z"), is_error: true },
    { line: "2026-09-04T10:05:00Z ERROR auth failed for user abc123", timestamp: Date.parse("2026-09-04T10:05:00Z"), is_error: true },
    { line: "2026-09-04T09:00:00Z INFO health ok", timestamp: Date.parse("2026-09-04T09:00:00Z"), is_error: false },
  ];
  const groups = groupErrors(lines.filter((l) => l.is_error), windowStart);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].count, 2);
  assert.equal(groups[0].samples.length, 2);
});

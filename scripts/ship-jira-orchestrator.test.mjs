import assert from "node:assert/strict";
import test from "node:test";

import { extractJson, normalizeOutcome } from "./ship-jira-orchestrator.mjs";

test("extractJson accepts fenced output", () => {
  assert.deepEqual(extractJson('```json\n{"result":"pass"}\n```'), { result: "pass" });
});

test("triage defaults malformed decisions to ready, not clarification", () => {
  assert.deepEqual(normalizeOutcome('{"decision":"unknown","comment":"checked"}', "triage"), {
    decision: "ready",
    comment: "checked",
  });
});

test("QA requires an explicit pass", () => {
  assert.equal(normalizeOutcome('{"result":"fail","comment":"broken"}', "qa").passed, false);
  assert.equal(normalizeOutcome('{"result":"pass","comment":"works"}', "qa").passed, true);
});

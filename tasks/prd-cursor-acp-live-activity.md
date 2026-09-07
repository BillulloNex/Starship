# PRD: Cursor ACP live activity

## 1. Introduction & Overview

When a user chats with Cursor through Grokbot, the canvas sits quiet from Send until the first assistant words. That wait is usually prefill, then tools, then (sometimes) reasoning, then text. Grokbot already knows how to render ACP thoughts and tool cards. Cursor does not feed that path today.

Grokbot’s Cursor adapter defaults to print mode because native `agent acp` still fails prompts with `RetriableError`. Print mode currently runs `agent -p --output-format json`, which buffers the whole turn and then emits one `agent_message_chunk`. Cursor’s CLI docs also say **thinking events are suppressed in print mode and will not appear in any output format**.

This work streams Cursor’s documented `stream-json` events into **standard ACP** `session/update` notifications so the existing chat UI can show tool activity (and partial text) while the turn is running. It does not invent a Cursor-specific frontend, fake thinking traces, or dual-run native ACP as a second product path.

## 2. Goals & Success Criteria

- After Send, the user sees live Cursor **tool calls** (start → complete/fail) before assistant prose, using the same ACP tool cards as Claude Code / Codex.
- Assistant text appears incrementally (`--stream-partial-output`), not as a single dump at the end of the turn.
- Prefill (no events yet) keeps using the existing typing indicator. No new “waiting phase” protocol.
- Thinking traces are shown **only if** Cursor actually emits them on the wire. Print/stream-json is documented not to. Native `agent acp` remains opt-in; if it later emits `agent_thought_chunk`, the UI already handles that.
- Mapper is pure, tested, and ignores unknown stream-json fields.
- `CURSOR_ACP_MODE=native` stays a thin passthrough. Do not make hybrid native+print the default architecture.
- Build/lint pass; a real Cursor turn in the app shows a tool card before final text.

## 3. Budget & Guardrail Recommendations

- **Recommended Mode:** no Ralph loop. This is a focused adapter change with one live verification turn.
- **Target Budget:** one implementation pass; one live Cursor conversation as the proof. Do not burn turns trying to un-break native `agent acp` unless a 15-minute spike shows it now completes a prompt.

## 4. User Stories (Atomic & Dependency-Ordered)

### US-001: Capture a real stream-json fixture

**Description:** As a maintainer, I want a recorded `agent -p --output-format stream-json --stream-partial-output` turn so the mapper is based on live CLI output, not memory.

**Acceptance Criteria:**
- [ ] Run `agent -p --trust -f --output-format stream-json --stream-partial-output` with `CURSOR_API_KEY` against a tiny prompt that forces a file read (e.g. read a known file in an empty/temp workspace).
- [ ] Save a redacted NDJSON fixture under `OpenHands/__tests__/scripts/fixtures/` (no API keys, truncate file contents).
- [ ] Document in the fixture header comment: which event types appeared (`system`, `assistant`, `tool_call`, `thinking` yes/no, `result`).
- [ ] Confirm against current Cursor CLI docs: thinking suppressed in print mode; skip duplicate assistant flushes (`timestamp_ms` + `model_call_id` rules).

### US-002: Map stream-json → ACP session/update

**Description:** As the Cursor ACP bridge, I want each NDJSON event translated into protocol updates the agent-server already understands.

**Acceptance Criteria:**
- [ ] Pure mapper (export from `scripts/cursor-acp-bridge.mjs` or a sibling module imported by it) with unit tests in `OpenHands/__tests__/scripts/cursor-acp-bridge.test.ts`.
- [ ] `tool_call` + `subtype: started` → `sessionUpdate: "tool_call"` with `toolCallId`, `status: "in_progress"`, `kind` (`read` / `edit` / `execute` / `fetch` / `other`), `title`, `rawInput`.
- [ ] `tool_call` + `subtype: completed` → `sessionUpdate: "tool_call_update"` with same `toolCallId`, `status: "completed"` or `"failed"`, `rawOutput` (truncated if huge).
- [ ] Known shapes: `readToolCall`, `writeToolCall`, `shellToolCall` / execute if present in the fixture, generic `function` fallback → `kind: "other"`.
- [ ] Unknown tool keys: still emit a tool_call with `kind: "other"` and a stable title; never throw.
- [ ] Assistant deltas with `timestamp_ms` and **no** `model_call_id` → `agent_message_chunk`. Skip duplicate flushes per Cursor docs.
- [ ] If a `thinking` event ever appears, map to `agent_thought_chunk`. Do not synthesize thoughts when absent.
- [ ] Terminal `result` event: use it only to finish the JSON-RPC `session/prompt` (`stopReason: "end_turn"`). Do **not** re-send concatenated `result` text if assistant chunks were already streamed.
- [ ] `system` / `user` / unknown types: ignore (no ACP spam).
- [ ] Typecheck & build pass (`npm --prefix OpenHands run build`).

### US-003: Stream print-mode turns instead of buffering json

**Description:** As a user, I want Cursor turns to stream into the chat instead of hanging until the process exits.

**Acceptance Criteria:**
- [ ] Default print path uses `--output-format stream-json --stream-partial-output` (keep `--trust -f`).
- [ ] Forward mapper output as `session/update` notifications while the child is running.
- [ ] Resolve `session/prompt` when the process exits 0 after a success `result`, or reject with the existing timeout/error helpers on failure.
- [ ] Idle timeout still works: any stdout line counts as activity (this should be *more* reliable than buffered json).
- [ ] Remove leftover debug `fetch` ingest in `callAgentPrint` while touching that function.
- [ ] Unit tests for timeout + “activity on each NDJSON line” stay green.
- [ ] Typecheck & build pass (`npm --prefix OpenHands run build`).

### US-004: Live UX check (no new Cursor UI)

**Description:** As a user, I want the existing chat to show Cursor tools and streaming text the same way other ACP agents do.

**Acceptance Criteria:**
- [ ] Start a Cursor ACP conversation in Grokbot and prompt it to read a file.
- [ ] An `ACPToolCallEvent` card appears **before** the final assistant paragraph.
- [ ] Typing indicator uses existing ACP tool title / think fallback; no new rainbow/waiting chrome in this PRD.
- [ ] Native mode (`CURSOR_ACP_MODE=native`) still starts; no new frontend branches for Cursor.
- [ ] **[UI]** Verify in the running app (local or `p{port}.beenex.org` if using a preview).

## 5. Functional Requirements

- FR-1: Print mode remains the default (`CURSOR_ACP_MODE` unset/`print`) until native `agent acp` completes a real prompt without `RetriableError`.
- FR-2: The bridge speaks ACP to OpenHands. Cursor-specific stream-json never leaks into the React app.
- FR-3: Tool cards must include a human title (path or command) when the CLI provides it. Generic “Terminal” with no command is acceptable only if the CLI omitted the command.
- FR-4: Partial assistant text streams; the user must not see the same paragraph twice at turn end.
- FR-5: Prefill silence is covered by the existing typing indicator (`ACTION_MESSAGE$THINK` fallback). No fabricated thought text.
- FR-6: Native ACP path stays: spawn `agent acp`, rewrite `{id,name}` → `{value,name}`, auto-answer Cursor extension methods. Do not map stream-json in native mode.
- FR-7: Permissions stay `--trust` in print mode (same as today). Do not add a Cursor permission UI in this pass.
- FR-8: Ignore unknown NDJSON fields and event types; mapper must be forward-compatible.

## 6. Non-Goals (Out of Scope)

- Fixing native `agent acp` `RetriableError` as a prerequisite (optional 15-minute spike only; if it still fails, stop).
- Dual-running native ACP and print for the same turn (hybrid session lifecycle).
- Cursor-only thinking UI, rainbow wait backgrounds (`message_boards/004_feature.md`), or a new “prefill” event type.
- Synthesizing or scraping thinking traces that print mode does not emit.
- Implementing Cursor extension UIs (`cursor/ask_question`, `cursor/create_plan`, todos) in the canvas.
- Team-dashboard MCP, JetBrains/Zed client work, or changing other ACP providers.
- Frontend changes unless a live turn proves the existing ACP renderer cannot show the mapped events.

## 7. Technical Considerations

**Why this shape**

- Stability: `agent -p` already completes turns in production; native ACP does not.
- Maintainability: one adapter (CLI stream → ACP). The canvas already renders `ACPToolCallEvent` and `agent_thought_chunk`.
- Stop before retrofit: do not parse Cursor `_meta`, do not add a second tool visualizer, do not keep json and stream-json as equal product modes.

**Touch points**

- `scripts/cursor-acp-bridge.mjs` — replace buffered `json` spawn with line-wise stream-json; emit ACP updates; delete debug ingest.
- `scripts/cursor-acp-auth-wrapper.sh` — comment only if the default path description changes.
- `OpenHands/__tests__/scripts/cursor-acp-bridge.test.ts` — mapper + timeout tests.
- No OpenHands UI files unless US-004 finds a real render gap.

**Mapper sketch**

```
stream-json tool_call.started  → ACP tool_call (in_progress)
stream-json tool_call.completed → ACP tool_call_update (completed|failed)
stream-json assistant (delta)   → ACP agent_message_chunk
stream-json thinking (if any)   → ACP agent_thought_chunk
stream-json result.success      → JSON-RPC session/prompt result (no extra text)
```

**Duplicate-text rule (Cursor docs)**

| `timestamp_ms` | `model_call_id` | Action |
|---|---|---|
| Present | Absent | Append text |
| Present | Present | Skip (pre-tool flush) |
| Absent | Absent | Skip (final flush) |

**Native ACP later**

If `agent acp` starts completing prompts, flipping `CURSOR_ACP_MODE=native` should give thoughts “for free” if the CLI emits `agent_thought_chunk`. Do not build a third mode to merge the two. Revisit default only after a production turn meets the ACP definition of working (materialize, prompt, tool, follow-up).

**Verification**

1. Unit tests on the fixture + mapper.
2. `npm --prefix OpenHands run lint` and `build`.
3. One live Cursor conversation: Send → tool card → streamed text.
4. Confirm thinking is absent unless the fixture shows a `thinking` event (expected: absent in print mode).

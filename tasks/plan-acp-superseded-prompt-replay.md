# Plan: replay a user message whose ACP prompt was superseded

## Bug

When an ACP agent (Cursor, Codex, Antigravity, …) is mid-prompt and the user sends
a second message, the agent-server cancels the running prompt and starts a new one
(`openhands/agent_server/event_service.py::send_message` →
`_mark_running_acp_prompt_superseded` → `interrupt(internal_acp_rerun=True)`).

In `openhands/sdk/conversation/impl/local_conversation.py`, the `except
asyncio.CancelledError:` block of `arun()` then does:

```python
superseded_by_new_message = bool(updated_agent_state.pop(ACP_SUPERSEDE_INFLIGHT_PROMPT, False))
completed_cancelled_prompt = self._state.execution_status == ConversationExecutionStatus.FINISHED
if (superseded_by_new_message or completed_cancelled_prompt) and inflight_prompt_user_message_id is not None:
    updated_agent_state[ACP_LAST_PROMPT_USER_MESSAGE_ID] = inflight_prompt_user_message_id
```

Advancing `ACP_LAST_PROMPT_USER_MESSAGE_ID` to the *cancelled* message marks it as
delivered. The restarted run only sends the messages after the cursor, so the first
message is never sent again. The external agent dropped the cancelled turn, so the
model never sees that message even though the chat log shows it.

Observed in production: user sent "clone a sample of dataset X", then "its a
huggingface dataset btw"; the agent answered only the second, and on "ok continue"
said it had no earlier dataset task.

## Fix (SDK build-time patch, same style as the other scripts in `patches/`)

Only the `superseded_by_new_message` case is wrong. A prompt the external agent
had already *finished* (`completed_cancelled_prompt`, status FINISHED) is correctly
marked delivered. Change the condition so a superseded, unfinished prompt leaves the
cursor where it was:

```python
if completed_cancelled_prompt and inflight_prompt_user_message_id is not None:
    updated_agent_state[ACP_LAST_PROMPT_USER_MESSAGE_ID] = inflight_prompt_user_message_id
elif superseded_by_new_message and inflight_prompt_user_message_id is not None:
    logger.info(
        "ACP prompt for user message %s was superseded before finishing; "
        "it will be replayed on the next run",
        inflight_prompt_user_message_id,
    )
```

The restarted run's step loop (`acp_step_user_message = acp_prompt_messages[last_prompt_index + 1]`)
then re-sends the superseded message as its own prompt, and the newer message as the
prompt after it, in original order. No other logic changes.

## Deliverables

1. `patches/fix-acp-superseded-prompt-replay.py`
   - Locate the installed `openhands/sdk/conversation/impl/local_conversation.py`
     via `importlib.util.find_spec("openhands.sdk.conversation.impl.local_conversation")`,
     with the same glob fallbacks the existing patch scripts use.
   - Idempotent: skip if marker `# GROKBOT-PATCH: acp-superseded-prompt-replay` is present.
   - Match the exact 4-line `if (` … `) and inflight_prompt_user_message_id is not None:`
     block shown above using an exact-string replace on the source text (not regex on
     whitespace). If the block is not found, print a WARNING and exit 0 without changing
     the file (same convention as `guard-watchdog-telemetry.py`), so a future SDK bump
     does not break the Docker build.
   - After patching, `ast.parse` the result and exit 1 on a SyntaxError.
   - Print `[fix-acp-superseded-prompt-replay] Patched: <path>` on success.
   - Keep the module docstring short: bug, incident date 2026-10-24, what it changes.
2. `Dockerfile`: add a `COPY` + `RUN python3 /tmp/fix-acp-superseded-prompt-replay.py && rm …`
   block right after the `fix-automation-sqlite-pool.py` block, with a 3-line comment
   explaining why.
3. `patches/test_fix_acp_superseded_prompt_replay.py` (pytest, stdlib only): write the
   original 4-line block into a temp file embedded in a minimal fake module body,
   run the patch function on it, assert the `elif superseded_by_new_message` branch
   exists, the marker exists, the result parses with `ast`, and a second run is a
   no-op. Also assert a file without the block is left untouched.

## Reference

The installed SDK 1.40.1 copy of the target file is at
`/Users/thomasthemaker/.cache/uv/archive-v0/GMxATeVRdPnAh_sO/openhands/sdk/conversation/impl/local_conversation.py`
(the `except asyncio.CancelledError:` block starts near line 2405). Read it to copy the
exact text to match; do not edit it.

## Constraints

- Do not modify any other file. Do not bump VERSION, do not commit.
- Python 3.12, stdlib only, no new dependencies.
- Run `python3 -m pytest patches/test_fix_acp_superseded_prompt_replay.py -q` and make it pass.

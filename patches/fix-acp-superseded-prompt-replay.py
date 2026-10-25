"""Build-time patch: replay user message whose ACP prompt was superseded.

Incident: 2026-10-24 — When an in-flight ACP prompt is interrupted by a newer user
message, local_conversation advanced ACP_LAST_PROMPT_USER_MESSAGE_ID to the cancelled
message ID, causing external agents (Cursor, Codex, Antigravity) to drop the turn.

This patch ensures local_conversation.py only advances the prompt cursor if the
cancelled prompt actually finished, leaving superseded prompts to be replayed.
"""

from __future__ import annotations

import ast
import glob
import importlib.util
import sys
from pathlib import Path

MARKER = "# GROKBOT-PATCH: acp-superseded-prompt-replay"

TARGET = (
    "                if (\n"
    "                    superseded_by_new_message or completed_cancelled_prompt\n"
    "                ) and inflight_prompt_user_message_id is not None:\n"
    "                    updated_agent_state[ACP_LAST_PROMPT_USER_MESSAGE_ID] = (\n"
    "                        inflight_prompt_user_message_id\n"
    "                    )"
)

REPLACEMENT = (
    "                # GROKBOT-PATCH: acp-superseded-prompt-replay\n"
    "                if completed_cancelled_prompt and inflight_prompt_user_message_id is not None:\n"
    "                    updated_agent_state[ACP_LAST_PROMPT_USER_MESSAGE_ID] = (\n"
    "                        inflight_prompt_user_message_id\n"
    "                    )\n"
    "                elif superseded_by_new_message and inflight_prompt_user_message_id is not None:\n"
    "                    logger.info(\n"
    '                        "ACP prompt for user message %s was superseded before finishing; "\n'
    '                        "it will be replayed on the next run",\n'
    "                        inflight_prompt_user_message_id,\n"
    "                    )"
)


def find_target_paths() -> list[Path]:
    """Locate installed local_conversation.py files."""
    paths: list[Path] = []
    try:
        spec = importlib.util.find_spec(
            "openhands.sdk.conversation.impl.local_conversation"
        )
    except (ModuleNotFoundError, ValueError):
        spec = None
    if spec and spec.origin:
        paths.append(Path(spec.origin))
    candidates = (
        glob.glob(
            "/usr/local/lib/python*/site-packages/openhands/sdk/conversation/impl/local_conversation.py"
        )
        + glob.glob(
            "/openhands/.venv/lib/python*/site-packages/openhands/sdk/conversation/impl/local_conversation.py"
        )
        + glob.glob(
            "/agent-server/.venv/lib/python*/site-packages/openhands/sdk/conversation/impl/local_conversation.py"
        )
        + glob.glob(
            "/opt/openhands-shared-sdk-venv/lib/python*/site-packages/openhands/sdk/conversation/impl/local_conversation.py"
        )
    )
    paths.extend(Path(p) for p in candidates)
    seen: set[Path] = set()
    unique: list[Path] = []
    for path in paths:
        resolved = path.resolve()
        if resolved in seen:
            continue
        seen.add(resolved)
        unique.append(resolved)
    return unique


def patch_file(path: str | Path) -> bool:
    """Patch local_conversation.py to replay superseded ACP prompts."""
    path = Path(path)
    source = path.read_text()

    if MARKER in source:
        print(f"[fix-acp-superseded-prompt-replay] Already patched: {path}")
        return False

    if TARGET in source:
        patched_source = source.replace(TARGET, REPLACEMENT, 1)
    else:
        print(
            f"[fix-acp-superseded-prompt-replay] WARNING: target block not found in {path}, skipping"
        )
        return False

    try:
        ast.parse(patched_source)
    except SyntaxError as e:
        print(
            f"[fix-acp-superseded-prompt-replay] ERROR: Patched file has syntax errors: {e}"
        )
        sys.exit(1)

    path.write_text(patched_source)
    print(f"[fix-acp-superseded-prompt-replay] Patched: {path}")
    return True


def main() -> int:
    paths = find_target_paths()
    if not paths:
        print(
            "[fix-acp-superseded-prompt-replay] WARNING: local_conversation.py not found. "
            "Skipping patch (non-fatal)."
        )
        return 0

    patched = 0
    for path in paths:
        if patch_file(path):
            patched += 1
    print(f"[fix-acp-superseded-prompt-replay] Done ({patched} file(s) patched).")
    return 0


if __name__ == "__main__":
    sys.exit(main())

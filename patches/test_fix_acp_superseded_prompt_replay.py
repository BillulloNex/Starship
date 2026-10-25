"""Unit tests for fix-acp-superseded-prompt-replay.py."""

from __future__ import annotations

import ast
import importlib.util
from pathlib import Path

PATCH_SCRIPT = Path(__file__).parent / "fix-acp-superseded-prompt-replay.py"

spec = importlib.util.spec_from_file_location(
    "fix_acp_superseded_prompt_replay", PATCH_SCRIPT
)
assert spec and spec.loader
patch_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(patch_module)
patch_file = patch_module.patch_file
MARKER = patch_module.MARKER
TARGET = patch_module.TARGET


def make_fake_module(block: str) -> str:
    return f'''"""Fake local_conversation module for testing."""
import asyncio
import logging

logger = logging.getLogger(__name__)

class ConversationExecutionStatus:
    FINISHED = "FINISHED"
    PAUSED = "PAUSED"

ACP_SUPERSEDE_INFLIGHT_PROMPT = "supersede"
ACP_LAST_PROMPT_USER_MESSAGE_ID = "last_prompt_id"
ACP_INFLIGHT_PROMPT_USER_MESSAGE_ID = "inflight_id"

class LocalConversation:
    def __init__(self):
        self._state = type("State", (), {{"agent_state": {{}}, "execution_status": "RUNNING"}})()

    def arun(self):
        try:
            pass
        except asyncio.CancelledError:
            with self._state:
                updated_agent_state = dict(self._state.agent_state)
                inflight_prompt_user_message_id = updated_agent_state.pop(
                    ACP_INFLIGHT_PROMPT_USER_MESSAGE_ID, None
                )
                superseded_by_new_message = bool(
                    updated_agent_state.pop(ACP_SUPERSEDE_INFLIGHT_PROMPT, False)
                )
                completed_cancelled_prompt = (
                    self._state.execution_status == ConversationExecutionStatus.FINISHED
                )
{block}
                self._state.agent_state = updated_agent_state
'''


def test_patch_original_block(tmp_path: Path):
    source = make_fake_module(TARGET)
    test_file = tmp_path / "fake_local_conversation.py"
    test_file.write_text(source)

    # First run: should patch the file
    assert patch_file(test_file) is True

    patched_content = test_file.read_text()
    assert MARKER in patched_content
    assert (
        "elif superseded_by_new_message and inflight_prompt_user_message_id is not None:"
        in patched_content
    )
    assert (
        'logger.info(\n'
        '                        "ACP prompt for user message %s was superseded before finishing; "\n'
        '                        "it will be replayed on the next run",\n'
        '                        inflight_prompt_user_message_id,\n'
        '                    )'
    ) in patched_content

    # Result parses cleanly with ast
    parsed_ast = ast.parse(patched_content)
    assert parsed_ast is not None

    # Second run: should be a no-op
    assert patch_file(test_file) is False
    assert test_file.read_text() == patched_content


def test_untouched_file_without_block(tmp_path: Path):
    original_content = """# Minimal module without target block
def hello():
    return "world"
"""
    test_file = tmp_path / "unrelated.py"
    test_file.write_text(original_content)

    assert patch_file(test_file) is False
    assert test_file.read_text() == original_content

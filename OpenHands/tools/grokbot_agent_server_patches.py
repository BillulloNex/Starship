"""Runtime patches for the openhands-agent-server process.

Production runs the PyInstaller ``openhands-agent-server`` binary. It never
reads site-packages edits (the build-time ``patches/*.py`` scripts) or
PYTHONPATH ``sitecustomize``, so a fix that must reach the agent-server
process lives here instead. The entrypoint loads this module through the
binary's own ``--import-modules`` hook, after ``OH_EXTRA_PYTHON_PATH`` has put
``/opt/agent-canvas/tools`` on ``sys.path``.

``--import-modules`` re-raises ImportError and aborts startup, so nothing in
this module may raise at import time: every patch logs and skips instead.
"""
from __future__ import annotations

import logging
import os
import threading

try:
    from openhands.sdk.logger import get_logger

    logger = get_logger(__name__)
except Exception:  # pragma: no cover - SDK logger is always present in the binary
    logger = logging.getLogger(__name__)


def _close_timeout_seconds() -> float:
    raw = os.environ.get("GROKBOT_CONVERSATION_CLOSE_TIMEOUT_SECONDS", "45")
    try:
        value = float(raw)
    except ValueError:
        return 45.0
    return value if value > 0 else 45.0


def bound_conversation_close(conversation_cls, timeout_seconds: float) -> bool:
    """Make ``conversation_cls.close`` give up after ``timeout_seconds``.

    Incident 2026-11-02: browser_use hung while launching Chromium, and the
    browser executor's close() then joined its portal thread forever. The
    agent-server awaits ``conversation.close`` while holding the global
    conversation ``_lifecycle_lock``, so every events read, every resume and
    every new conversation queued behind it for 13 hours.

    The original close runs on a daemon thread. If it is still running at the
    deadline it is abandoned and logged; the thread keeps whatever resource
    hung, but the lock is released and the rest of the server keeps serving.
    """
    original = conversation_cls.close
    if getattr(original, "_grokbot_bounded", False):
        return False

    def close(self) -> None:
        if getattr(self, "_cleanup_complete", False):
            return
        errors: list[BaseException] = []

        def run() -> None:
            try:
                original(self)
            except BaseException as exc:  # re-raised on the caller's thread
                errors.append(exc)

        conversation_id = getattr(self, "id", "?")
        worker = threading.Thread(
            target=run, name=f"conversation-close-{conversation_id}", daemon=True
        )
        worker.start()
        worker.join(timeout_seconds)
        if worker.is_alive():
            logger.error(
                "Conversation %s close() still running after %.0fs; abandoning it "
                "so the agent-server can keep serving other conversations",
                conversation_id,
                timeout_seconds,
            )
            return
        if errors:
            raise errors[0]

    close._grokbot_bounded = True  # type: ignore[attr-defined]
    close.__doc__ = original.__doc__
    conversation_cls.close = close
    return True


BROWSER_TOOL_NAME = "browser_tool_set"


def disable_tool_usability(registry, tool_name: str) -> bool:
    """Make the SDK tool registry report ``tool_name`` as unusable.

    The image hides Chromium behind a shim that exits 1 (agents browse through
    chrome-devtools-mcp instead), but the shim still satisfies the browser
    tool's usability check. So the agent-server appended ``browser_tool_set``
    to every profile launch without an explicit tool list, and on 2026-11-02 a
    browser_use launch against the shim hung the conversation's close.

    ``is_tool_usable`` (profile-launch injection) and ``list_usable_tools``
    (``/server_info``, which the canvas also gates on) both resolve
    ``registry._check_tool_usable`` at call time, so wrapping it holds no matter
    when the tool registers. Conversations that already persisted the tool keep
    it; the bounded close above contains those.
    """
    original = registry._check_tool_usable
    if getattr(original, "_grokbot_disabled", None) == tool_name:
        return False

    def check(name, checker):
        if name == tool_name:
            return False
        return original(name, checker)

    check._grokbot_disabled = tool_name  # type: ignore[attr-defined]
    registry._check_tool_usable = check
    return True


def _apply() -> None:
    try:
        from openhands.sdk.conversation.impl.local_conversation import (
            LocalConversation,
        )

        if bound_conversation_close(LocalConversation, _close_timeout_seconds()):
            logger.info("[grokbot] Bounded LocalConversation.close")
    except Exception:
        logger.exception("[grokbot] Could not bound LocalConversation.close")

    try:
        from openhands.sdk.tool import registry

        if disable_tool_usability(registry, BROWSER_TOOL_NAME):
            logger.info("[grokbot] Disabled %s (Chromium is shimmed)", BROWSER_TOOL_NAME)
    except Exception:
        logger.exception("[grokbot] Could not disable %s", BROWSER_TOOL_NAME)


_apply()

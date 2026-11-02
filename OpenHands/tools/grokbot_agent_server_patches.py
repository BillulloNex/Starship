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


def _apply() -> None:
    try:
        from openhands.sdk.conversation.impl.local_conversation import (
            LocalConversation,
        )

        if bound_conversation_close(LocalConversation, _close_timeout_seconds()):
            logger.info("[grokbot] Bounded LocalConversation.close")
    except Exception:
        logger.exception("[grokbot] Could not bound LocalConversation.close")


_apply()

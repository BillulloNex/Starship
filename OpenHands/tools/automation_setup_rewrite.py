"""Rewrite automation bash chains so setup.sh cannot create per-run SDK venvs."""

from __future__ import annotations

import os
from collections.abc import Awaitable, Callable
from functools import wraps
from typing import Any, TypeVar


DEFAULT_SETUP_WRAPPER = "/opt/agent-canvas/tools/run-automation-setup.sh"
SETUP_WRAPPER_ENV = "GROKBOT_AUTOMATION_SETUP_WRAPPER"
_REWRITE_MARK = "run-automation-setup.sh"

F = TypeVar("F", bound=Callable[..., Awaitable[Any]])


def setup_wrapper_path() -> str:
    return os.environ.get(SETUP_WRAPPER_ENV, DEFAULT_SETUP_WRAPPER)


def rewrite_setup_command(command: str, wrapper: str | None = None) -> str:
    """Replace `bash setup.sh` with the shared-venv wrapper when available.

    Existing automation tarballs still contain the upstream preset setup.sh
    that runs `uv venv .venv` and pip-installs ~540 MB of SDK packages into
    every run directory. The wrapper points `.venv` at a shared install and
    no-ops those uv commands.
    """
    if not command or _REWRITE_MARK in command:
        return command
    path = wrapper if wrapper is not None else setup_wrapper_path()
    if not path or not os.path.isfile(path):
        return command
    return command.replace("bash setup.sh", f"bash {path}")


def patch_callable_command_arg(fn: F, command_index: int = 3) -> F:
    """Wrap an async function whose `command` arg should be rewritten."""

    @wraps(fn)
    async def wrapped(*args: Any, **kwargs: Any) -> Any:
        if "command" in kwargs and isinstance(kwargs["command"], str):
            kwargs["command"] = rewrite_setup_command(kwargs["command"])
        elif len(args) > command_index and isinstance(args[command_index], str):
            args = list(args)  # type: ignore[assignment]
            args[command_index] = rewrite_setup_command(args[command_index])
            args = tuple(args)
        return await fn(*args, **kwargs)

    return wrapped  # type: ignore[return-value]


def install_execution_patches() -> bool:
    """Monkey-patch openhands-automation bash starters. Returns True on success."""
    try:
        import openhands.automation.execution as execution
    except Exception:
        return False

    patched = False
    for name in ("_start_bash", "_bash"):
        original = getattr(execution, name, None)
        if original is None or getattr(original, "_grokbot_shared_venv", False):
            continue
        wrapped = patch_callable_command_arg(original, command_index=3)
        wrapped._grokbot_shared_venv = True  # type: ignore[attr-defined]
        setattr(execution, name, wrapped)
        patched = True
    return patched

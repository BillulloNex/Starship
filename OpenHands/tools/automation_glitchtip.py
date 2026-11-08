"""Report every scheduled automation run outcome to GlitchTip.

Automation runs used to fail for days with nothing but a FAILED row in the
automation SQLite DB (random_incidents 0039/0040). This module hooks the one
call every terminal run transition already makes — the product telemetry
``capture_automation_event("automation_run_completed" | "automation_run_failed")``
in the dispatcher, watchdog and completion-callback router — and:

* on failure: files a GlitchTip Issue (grouped per automation) and a log line;
* on success: writes a log line and pings that automation's GlitchTip
  Heartbeat monitor, so a job that silently stops running also alerts.

Heartbeat endpoint ids come from ``GLITCHTIP_HEARTBEATS`` (set in Coolify):
``automation:<automation id hex>=<endpoint uuid>,...``. Every hook is
best-effort: it never raises into the automation service and always calls
the original telemetry function.
"""

from __future__ import annotations

import os
import re
import sys
import threading
import urllib.request
from functools import wraps
from typing import Any

HEARTBEAT_BASE = (
    "https://glitchtip.beenex.cloud/api/0/organizations/beenex/heartbeat_check"
)
_PATCH_MARK = "_grokbot_glitchtip"


def _log(msg: str) -> None:
    print(f"[grokbot-automation-glitchtip] {msg}", file=sys.stderr, flush=True)


def heartbeat_map(raw: str | None = None) -> dict[str, str]:
    """Parse ``key=endpoint-uuid,key=endpoint-uuid`` (no quotes: Coolify-safe)."""
    raw = os.environ.get("GLITCHTIP_HEARTBEATS", "") if raw is None else raw
    out: dict[str, str] = {}
    for pair in raw.split(","):
        key, sep, value = pair.partition("=")
        if sep and key.strip() and value.strip():
            out[key.strip()] = value.strip()
    return out


def automation_key(automation_id: Any) -> str:
    return "automation:" + str(automation_id or "").replace("-", "").lower()


def ping_heartbeat(key: str, timeout: float = 10.0) -> bool:
    endpoint = heartbeat_map().get(key)
    if not endpoint:
        return False
    try:
        req = urllib.request.Request(
            f"{HEARTBEAT_BASE}/{endpoint}/",
            method="POST",
            data=b"",
            headers={"User-Agent": "starship-automation-heartbeat/1"},
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return 200 <= resp.status < 300
    except Exception as e:  # noqa: BLE001 - a ping must never break a run
        _log(f"heartbeat {key} failed: {e}")
        return False


def _ping_in_background(key: str) -> None:
    threading.Thread(target=ping_heartbeat, args=(key,), daemon=True).start()


def _sentry():
    try:
        import sentry_sdk

        if sentry_sdk.get_client().is_active():
            return sentry_sdk
    except Exception:  # noqa: BLE001
        pass
    return None


def _loaded(obj: Any, name: str) -> Any:
    """Read an ORM attribute only if already loaded (no async lazy-load)."""
    if obj is None:
        return None
    try:
        from sqlalchemy import inspect as sa_inspect

        state = sa_inspect(obj, raiseerr=False)
        if state is not None and name in state.unloaded:
            return None
    except Exception:  # noqa: BLE001
        pass
    try:
        return getattr(obj, name, None)
    except Exception:  # noqa: BLE001
        return None


async def _scalar(stmt: Any, session: Any, session_factory: Any) -> Any:
    try:
        if session is not None:
            return (await session.execute(stmt)).scalar()
        if session_factory is not None:
            async with session_factory() as s:
                return (await s.execute(stmt)).scalar()
    except Exception:  # noqa: BLE001
        pass
    return None


async def _error_detail(run: Any, session: Any, session_factory: Any) -> str:
    """Read the run's error_detail; callers often update it via raw SQL."""
    detail = _loaded(run, "error_detail")
    if detail or run is None:
        return detail or ""
    try:
        from sqlalchemy import select
        from openhands.automation.models import AutomationRun

        stmt = select(AutomationRun.error_detail).where(AutomationRun.id == run.id)
    except Exception:  # noqa: BLE001
        return ""
    return (await _scalar(stmt, session, session_factory)) or ""


async def _automation_name(automation_id: Any, session: Any, session_factory: Any) -> str:
    if not automation_id:
        return "unknown"
    try:
        from sqlalchemy import select
        from openhands.automation.models import Automation

        stmt = select(Automation.name).where(Automation.id == automation_id)
    except Exception:  # noqa: BLE001
        return "unknown"
    return (await _scalar(stmt, session, session_factory)) or "unknown"


def summarize_error(detail: str) -> str:
    """One stable line for grouping: the stderr line if present, else the first."""
    lines = [ln.strip() for ln in (detail or "").splitlines() if ln.strip()]
    pick = next((ln[len("stderr:"):].strip() for ln in lines if ln.startswith("stderr:")), "")
    if not pick:
        pick = lines[0] if lines else "no detail"
    pick = re.sub(r"[0-9a-f]{8,}(-[0-9a-f]{4,})*", "{ID}", pick, flags=re.I)
    return pick[:200]


async def report_run_event(event: str, kwargs: dict[str, Any]) -> None:
    if event not in ("automation_run_completed", "automation_run_failed"):
        return
    run = kwargs.get("run")
    session = kwargs.get("session")
    session_factory = kwargs.get("session_factory")
    automation = kwargs.get("automation") or _loaded(run, "automation")
    automation_id = _loaded(automation, "id") or _loaded(run, "automation_id")
    name = _loaded(automation, "name") or await _automation_name(
        automation_id, session, session_factory
    )
    props = kwargs.get("properties") or {}
    attrs = {
        "automation_id": str(automation_id or ""),
        "automation_name": name,
        "run_id": str(_loaded(run, "id") or ""),
        "conversation_id": str(_loaded(run, "conversation_id") or ""),
        "trigger_source": str(props.get("trigger_source", "")),
    }
    sentry_sdk = _sentry()

    if event == "automation_run_completed":
        _ping_in_background(automation_key(automation_id))
        if sentry_sdk:
            from sentry_sdk import logger as sentry_logger

            sentry_logger.info("automation run completed", attributes=attrs)
        return

    detail = await _error_detail(run, session, session_factory)
    attrs["failure_kind"] = str(props.get("failure_kind", ""))
    attrs["error_detail"] = detail[:2000]
    _log(f"run failed: {name} ({attrs['run_id']}): {detail[:300]!r}")
    if not sentry_sdk:
        return
    from sentry_sdk import logger as sentry_logger

    sentry_logger.error("automation run failed", attributes=attrs)
    first_line = summarize_error(detail)
    with sentry_sdk.new_scope() as scope:
        scope.set_tag("automation_id", attrs["automation_id"])
        scope.set_tag("automation_name", name[:200])
        scope.set_tag("job", "automation-run")
        scope.set_context("automation_run", attrs)
        scope.fingerprint = ["automation-run-failed", attrs["automation_id"], first_line]
        sentry_sdk.capture_message(
            f"Automation run failed: {name}: {first_line}", level="error"
        )


def wrap_capture(original):
    if getattr(original, _PATCH_MARK, False):
        return original

    @wraps(original)
    async def wrapped(event, *args, **kwargs):
        try:
            await report_run_event(event, kwargs)
        except Exception as e:  # noqa: BLE001
            _log(f"report failed: {e}")
        return await original(event, *args, **kwargs)

    setattr(wrapped, _PATCH_MARK, True)
    return wrapped


def install() -> bool:
    """Patch telemetry and every already-imported module that copied it."""
    try:
        import openhands.automation.telemetry as telemetry
    except Exception:  # noqa: BLE001
        return False
    original = telemetry.capture_automation_event
    wrapped = wrap_capture(original)
    telemetry.capture_automation_event = wrapped
    for mod_name, mod in list(sys.modules.items()):
        if mod_name.startswith("openhands.automation.") and getattr(
            mod, "capture_automation_event", None
        ) is original:
            mod.capture_automation_event = wrapped
    return True

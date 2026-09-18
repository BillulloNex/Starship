"""
Shared PostHog Logs shipper for Grokbot Python processes (stdlib only).

Ships batched OTLP/HTTP+JSON to ``<POSTHOG_HOST>/i/v1/logs`` with
``service.name`` / ``deployment.environment`` / ``service.version``
resource attributes. Stdlib only (urllib + threading) so it works inside
the agent-server venv, the automation venv, and repo scripts without new
dependencies — the image already installs the OTel exporter, but nothing
here requires it.

Never raises and never blocks the host process: without an API key it is
a no-op, transport errors are swallowed, and the flush thread is a daemon.

Env (Coolify is the source of truth, never commit values):
    POSTHOG_PROJECT_API_KEY (or VITE_POSTHOG_API_KEY / POSTHOG_API_KEY)
    POSTHOG_API_HOST (default https://us.i.posthog.com)
    POSTHOG_LOGS_ENABLED=0 to disable
    POSTHOG_LOG_ENV (deployment.environment)
"""

import atexit
import json
import logging
import os
import queue
import threading
import time
import urllib.request

_SEVERITY_NUMBER = {
    "TRACE": 1,
    "DEBUG": 5,
    "INFO": 9,
    "WARNING": 13,
    "WARN": 13,
    "ERROR": 17,
    "CRITICAL": 21,
    "FATAL": 21,
}

_FLUSH_INTERVAL_S = 3.0
_MAX_QUEUE = 2000
_MAX_BODY_CHARS = 8000

_state = None
_state_lock = threading.Lock()


def _read_key():
    for name in (
        "POSTHOG_PROJECT_API_KEY",
        "VITE_POSTHOG_API_KEY",
        "POSTHOG_API_KEY",
    ):
        value = (os.environ.get(name) or "").strip()
        if value:
            return value
    return ""


def _read_host():
    host = (
        os.environ.get("POSTHOG_API_HOST")
        or os.environ.get("VITE_POSTHOG_HOST")
        or "https://us.i.posthog.com"
    ).strip().rstrip("/")
    return host


def _otlp_value(value):
    if isinstance(value, bool):
        return {"boolValue": value}
    if isinstance(value, int):
        return {"intValue": str(value)}
    if isinstance(value, float):
        return {"doubleValue": value}
    return {"stringValue": str(value)}


def _otlp_attributes(attrs):
    out = []
    for key, value in list((attrs or {}).items())[:32]:
        if value is None:
            continue
        out.append({"key": str(key), "value": _otlp_value(value)})
    return out


class _PostHogHandler(logging.Handler):
    """logging.Handler that forwards records to the shared queue."""

    def __init__(self, service_state):
        super().__init__(level=logging.DEBUG)
        self._service_state = service_state

    def emit(self, record):
        try:
            body = record.getMessage()[:_MAX_BODY_CHARS]
            if not body:
                return
            attrs = {
                "logger": record.name,
                "level": record.levelname,
            }
            if record.pathname:
                attrs["code.filepath"] = record.pathname
                attrs["code.lineno"] = record.lineno
            if record.exc_text:
                attrs["exception"] = str(record.exc_text)[:2000]
            self._service_state["emit"](
                record.levelname, body, attrs
            )
        except Exception:
            pass


def _flush(service_state):
    items = []
    q = service_state["queue"]
    try:
        while True:
            items.append(q.get_nowait())
    except queue.Empty:
        pass
    if not items:
        return
    payload = json.dumps(
        {
            "resourceLogs": [
                {
                    "resource": {
                        "attributes": _otlp_attributes(
                            service_state["resource_attributes"]
                        )
                    },
                    "scopeLogs": [{"logRecords": items}],
                }
            ]
        }
    ).encode("utf-8")
    try:
        req = urllib.request.Request(
            service_state["endpoint"],
            data=payload,
            headers={
                "Authorization": "Bearer %s" % service_state["api_key"],
                "Content-Type": "application/json",
                "User-Agent": "grokbot-posthog-logs/1.0",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            resp.read()
    except Exception:
        pass


def _flusher_loop(service_state):
    while True:
        time.sleep(_FLUSH_INTERVAL_S)
        try:
            _flush(service_state)
        except Exception:
            pass


def _emit(service_state, level, body, attrs):
    text = str(body or "")[:_MAX_BODY_CHARS]
    if not text:
        return
    severity = _SEVERITY_NUMBER.get(str(level).upper(), 9)
    record = {
        "timeUnixNano": str(int(time.time() * 1e9)),
        "severityText": str(level).upper(),
        "severityNumber": severity,
        "body": {"stringValue": text},
        "attributes": _otlp_attributes(attrs),
    }
    q = service_state["queue"]
    try:
        q.put_nowait(record)
    except queue.Full:
        try:
            q.get_nowait()
        except queue.Empty:
            pass
        try:
            q.put_nowait(record)
        except queue.Full:
            pass
    if q.qsize() >= 100:
        _flush(service_state)


def init_posthog_logs(service_name=None, service_version=None):
    """Attach the PostHog shipper to the root logger. Idempotent.

    Returns True when shipping is active, False when disabled (no key or
    POSTHOG_LOGS_ENABLED=0). Never raises.
    """
    global _state
    try:
        with _state_lock:
            if _state is not None:
                return _state["active"]
            enabled = (os.environ.get("POSTHOG_LOGS_ENABLED", "1")).strip() != "0"
            api_key = _read_key()
            active = bool(enabled and api_key)
            service_state = {
                "active": active,
                "api_key": api_key,
                "endpoint": "%s/i/v1/logs" % _read_host(),
                "resource_attributes": {
                    "service.name": service_name or "python-worker",
                    "deployment.environment": (
                        os.environ.get("POSTHOG_LOG_ENV") or "production"
                    ).strip()
                    or "production",
                },
                "queue": queue.Queue(maxsize=_MAX_QUEUE),
            }
            if service_version:
                service_state["resource_attributes"]["service.version"] = str(
                    service_version
                )
            service_state["emit"] = lambda level, body, attrs: _emit(
                service_state, level, body, attrs
            )
            _state = service_state
            if not active:
                return False
            root = logging.getLogger()
            root.setLevel(min(root.level, logging.DEBUG))
            root.addHandler(_PostHogHandler(service_state))
            thread = threading.Thread(
                target=_flusher_loop, args=(service_state,), daemon=True
            )
            thread.start()
            atexit.register(_flush, service_state)
            return True
    except Exception:
        return False


def ph_log(level, body, attrs=None):
    """Queue one structured log record. No-op when not initialized."""
    try:
        if _state is None or not _state.get("active"):
            return
        _state["emit"](level, body, attrs or {})
    except Exception:
        pass

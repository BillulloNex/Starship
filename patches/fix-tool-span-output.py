"""Build-time patch: record tool results and failures on OpenHands tool spans.

Incident: 2026-11-05 (random_incidents 0038) — Every TerminalAction /
FileEditorAction span in Langfuse had an empty output and DEFAULT level.
agent.py wraps each tool call in lmnr's observe(), but the returned Observation
is a pydantic model that lmnr cannot serialise, so the output was dropped, and a
failed command (non-zero exit code or is_error) never marked the span as failed.

This patch gives the observe() call an output formatter that writes the
observation text, exit code and is_error flag, and sets the span status to
ERROR when the tool failed. It is idempotent and skips files whose target code
has changed shape.
"""

from __future__ import annotations

import ast
import glob
import importlib.util
import sys
from pathlib import Path

MARKER = "# GROKBOT-PATCH: tool-span-output"

TARGET = (
    "                observation: Observation = observe(\n"
    "                    name=tool_name,\n"
    '                    span_type="TOOL",\n'
    '                    metadata={"tool_call_id": action_event.tool_call.id},\n'
    "                )(tool)(action_event.action, conversation)"
)

REPLACEMENT = (
    "                # GROKBOT-PATCH: tool-span-output\n"
    "                def _grokbot_run_tool(action, conv, _tool=tool):\n"
    "                    result = _tool(action, conv)\n"
    "                    try:\n"
    "                        exit_code = getattr(result, \"exit_code\", None)\n"
    "                        failed = bool(getattr(result, \"is_error\", False)) or (\n"
    "                            isinstance(exit_code, int) and exit_code > 0\n"
    "                        )\n"
    "                        if failed:\n"
    "                            from opentelemetry import trace as _otel_trace\n"
    "                            from opentelemetry.trace import Status, StatusCode\n"
    "\n"
    "                            message = (\n"
    "                                f\"exit code {exit_code}\"\n"
    "                                if isinstance(exit_code, int) and exit_code > 0\n"
    "                                else \"tool returned an error\"\n"
    "                            )\n"
    "                            _otel_trace.get_current_span().set_status(\n"
    "                                Status(StatusCode.ERROR, message)\n"
    "                            )\n"
    "                    except Exception:\n"
    "                        pass\n"
    "                    return result\n"
    "\n"
    "                def _grokbot_tool_output(result):\n"
    "                    import json as _json\n"
    "\n"
    "                    try:\n"
    "                        text = result.text\n"
    "                    except Exception:\n"
    "                        text = str(result)\n"
    "                    payload = {\n"
    "                        \"output\": text[:8000],\n"
    "                        \"is_error\": bool(getattr(result, \"is_error\", False)),\n"
    "                    }\n"
    "                    exit_code = getattr(result, \"exit_code\", None)\n"
    "                    if isinstance(exit_code, int):\n"
    "                        payload[\"exit_code\"] = exit_code\n"
    "                    return _json.dumps(payload, ensure_ascii=False)\n"
    "\n"
    "                observation: Observation = observe(\n"
    "                    name=tool_name,\n"
    '                    span_type="TOOL",\n'
    '                    metadata={"tool_call_id": action_event.tool_call.id},\n'
    "                    output_formatter=_grokbot_tool_output,\n"
    "                )(_grokbot_run_tool)(action_event.action, conversation)"
)


def find_target_paths() -> list[Path]:
    """Locate every installed openhands/sdk/agent/agent.py."""
    paths: list[Path] = []
    try:
        spec = importlib.util.find_spec("openhands.sdk.agent.agent")
    except (ModuleNotFoundError, ValueError):
        spec = None
    if spec and spec.origin:
        paths.append(Path(spec.origin))
    rel = "site-packages/openhands/sdk/agent/agent.py"
    for root in (
        "/usr/local/lib/python*",
        "/openhands/.venv/lib/python*",
        "/agent-server/.venv/lib/python*",
        "/opt/openhands-shared-sdk-venv/lib/python*",
    ):
        paths.extend(Path(p) for p in glob.glob(f"{root}/{rel}"))
    seen: set[Path] = set()
    unique: list[Path] = []
    for path in paths:
        resolved = path.resolve()
        if resolved not in seen:
            seen.add(resolved)
            unique.append(resolved)
    return unique


def patch_file(path: Path) -> bool:
    source = path.read_text(encoding="utf-8")
    if MARKER in source:
        print(f"[tool-span-output] Already patched: {path}")
        return False
    if source.count(TARGET) != 1:
        print(f"[tool-span-output] WARNING: target not found exactly once in {path}, skipping")
        return False
    patched = source.replace(TARGET, REPLACEMENT)
    ast.parse(patched)
    path.write_text(patched, encoding="utf-8")
    print(f"[tool-span-output] Patched: {path}")
    return True


def main() -> int:
    paths = find_target_paths()
    if not paths:
        print("[tool-span-output] WARNING: openhands.sdk.agent.agent not found, nothing to patch")
        return 0
    for path in paths:
        patch_file(path)
    return 0


if __name__ == "__main__":
    sys.exit(main())

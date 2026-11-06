"""Unit tests for fix-tool-span-output.py."""

from __future__ import annotations

import importlib.util
import json
import textwrap
from pathlib import Path

PATCH_SCRIPT = Path(__file__).parent / "fix-tool-span-output.py"

spec = importlib.util.spec_from_file_location("fix_tool_span_output", PATCH_SCRIPT)
assert spec and spec.loader
patch_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(patch_module)


def make_fake_module(tmp_path: Path) -> Path:
    """A module whose method contains the exact block agent.py has."""
    body = textwrap.indent(patch_module.TARGET.strip("\n"), "")
    source = (
        "from opentelemetry import trace\n"
        "Observation = object\n"
        "CAPTURED = {}\n"
        "\n"
        "def observe(name=None, span_type=None, metadata=None, output_formatter=None):\n"
        "    def deco(fn):\n"
        "        def run(*args):\n"
        "            tracer = trace.get_tracer('test')\n"
        "            with tracer.start_as_current_span(name) as span:\n"
        "                result = fn(*args)\n"
        "                CAPTURED['output'] = output_formatter(result) if output_formatter else None\n"
        "                CAPTURED['span'] = span\n"
        "            return result\n"
        "        return run\n"
        "    return deco\n"
        "\n"
        "class ToolCall:\n"
        "    id = 'call-1'\n"
        "\n"
        "class ActionEvent:\n"
        "    tool_call = ToolCall()\n"
        "    action = 'act'\n"
        "\n"
        "def execute(tool, tool_name='TerminalAction', conversation=None):\n"
        "    action_event = ActionEvent()\n"
        "    if True:\n"
        "        if True:\n"
        f"{body}\n"
        "    return observation\n"
    )
    path = tmp_path / "fake_agent.py"
    path.write_text(source, encoding="utf-8")
    return path


def load(path: Path):
    s = importlib.util.spec_from_file_location("fake_agent", path)
    module = importlib.util.module_from_spec(s)
    s.loader.exec_module(module)
    return module


class Obs:
    def __init__(self, text, is_error=False, exit_code=None):
        self.text = text
        self.is_error = is_error
        if exit_code is not None:
            self.exit_code = exit_code


def setup_tracer():
    from opentelemetry import trace
    from opentelemetry.sdk.trace import TracerProvider

    if not isinstance(trace.get_tracer_provider(), TracerProvider):
        trace.set_tracer_provider(TracerProvider())


def test_patch_applies_once_and_is_idempotent(tmp_path):
    path = make_fake_module(tmp_path)
    assert patch_module.patch_file(path) is True
    assert patch_module.MARKER in path.read_text()
    assert patch_module.patch_file(path) is False


def test_patch_skips_changed_code(tmp_path):
    path = tmp_path / "other.py"
    path.write_text("x = 1\n")
    assert patch_module.patch_file(path) is False


def test_failed_command_sets_error_and_output(tmp_path):
    setup_tracer()
    from opentelemetry.trace import StatusCode

    path = make_fake_module(tmp_path)
    patch_module.patch_file(path)
    module = load(path)
    module.execute(lambda action, conv: Obs("boom", exit_code=2))
    out = json.loads(module.CAPTURED["output"])
    assert out == {"output": "boom", "is_error": False, "exit_code": 2}
    assert module.CAPTURED["span"].status.status_code == StatusCode.ERROR


def test_successful_command_stays_ok(tmp_path):
    setup_tracer()
    from opentelemetry.trace import StatusCode

    path = make_fake_module(tmp_path)
    patch_module.patch_file(path)
    module = load(path)
    module.execute(lambda action, conv: Obs("ok", exit_code=0))
    assert json.loads(module.CAPTURED["output"])["exit_code"] == 0
    assert module.CAPTURED["span"].status.status_code != StatusCode.ERROR

"""
Build-time patch: wrap telemetry calls in the automation watchdog with try/except
so a non-critical telemetry failure can never abort run cleanup.

Incident: 2026-08-30 — A datetime naive/aware mismatch in capture_automation_event()
caused _verify_and_mark_run() to throw, leaving stale runs in an infinite crash loop.

This script is idempotent: it skips if the guard is already present or the target
code has changed shape.
"""

import ast
import importlib.util
import sys
import textwrap


def find_watchdog_path():
    """Locate the installed watchdog.py from openhands-automation."""
    spec = importlib.util.find_spec("openhands.automation.watchdog")
    if spec and spec.origin:
        return spec.origin
    # Fallback: common install locations
    import glob
    candidates = glob.glob(
        "/usr/local/lib/python*/site-packages/openhands/automation/watchdog.py"
    ) + glob.glob(
        "/openhands/.venv/lib/python*/site-packages/openhands/automation/watchdog.py"
    ) + glob.glob(
        "/agent-server/.venv/lib/python*/site-packages/openhands/automation/watchdog.py"
    )
    return candidates[0] if candidates else None


def patch_file(path):
    """Patch capture_automation_event calls to be non-fatal."""
    with open(path, "r") as f:
        source = f.read()

    # Already patched?
    if "# GROKBOT-GUARD: telemetry non-fatal" in source:
        print(f"[guard-watchdog-telemetry] Already patched: {path}")
        return False

    # Verify the target pattern exists
    if "capture_automation_event(" not in source:
        print(f"[guard-watchdog-telemetry] WARNING: capture_automation_event not found in {path}, skipping")
        return False

    # Strategy: find lines with `await capture_automation_event(` that are inside
    # _verify_and_mark_run and wrap the entire call (which may span multiple lines)
    # in a try/except block.
    #
    # We use a simpler, more robust approach: find the function _verify_and_mark_run
    # and wrap each `await capture_automation_event(...)` call block.

    lines = source.split("\n")
    new_lines = []
    i = 0
    in_verify_func = False
    func_indent = ""
    patched_count = 0

    while i < len(lines):
        line = lines[i]

        # Detect entering _verify_and_mark_run
        stripped = line.lstrip()
        if stripped.startswith("async def _verify_and_mark_run") or stripped.startswith("def _verify_and_mark_run"):
            in_verify_func = True
            func_indent = line[: len(line) - len(stripped)]
            new_lines.append(line)
            i += 1
            continue

        # Detect leaving the function (another top-level def/class at same or lower indent)
        if in_verify_func and stripped and not line.startswith(" ") and not line.startswith("\t"):
            if stripped.startswith("def ") or stripped.startswith("async def ") or stripped.startswith("class "):
                in_verify_func = False

        if in_verify_func and "capture_automation_event(" in line and "# GROKBOT-GUARD" not in line:
            # Find the indentation of this call
            call_indent = line[: len(line) - len(line.lstrip())]
            body_indent = call_indent + "    "

            # Collect all lines of this call (it may span multiple lines with
            # parentheses). Track paren depth.
            call_lines = [line]
            depth = line.count("(") - line.count(")")
            j = i + 1
            while depth > 0 and j < len(lines):
                call_lines.append(lines[j])
                depth += lines[j].count("(") - lines[j].count(")")
                j += 1

            # Emit the try/except wrapper
            new_lines.append(f"{call_indent}try:  # GROKBOT-GUARD: telemetry non-fatal")
            for cl in call_lines:
                # Re-indent each line of the call by adding 4 spaces
                if cl.strip():
                    new_lines.append(f"    {cl}")
                else:
                    new_lines.append(cl)
            new_lines.append(f"{call_indent}except Exception:")
            new_lines.append(f"{body_indent}import logging as _lg")
            new_lines.append(f'{body_indent}_lg.getLogger("openhands.automation.watchdog").warning(')
            new_lines.append(f'{body_indent}    "Telemetry failed for run %s (non-fatal)", getattr(run, "id", "?"), exc_info=True')
            new_lines.append(f"{body_indent})")

            patched_count += 1
            i = j
            continue

        new_lines.append(line)
        i += 1

    if patched_count == 0:
        print(f"[guard-watchdog-telemetry] WARNING: No capture_automation_event calls found inside _verify_and_mark_run in {path}")
        print("[guard-watchdog-telemetry] The upstream code may have changed shape. Skipping patch.")
        return False

    patched_source = "\n".join(new_lines)

    # Validate syntax of patched file
    try:
        ast.parse(patched_source)
    except SyntaxError as e:
        print(f"[guard-watchdog-telemetry] ERROR: Patched file has syntax errors: {e}")
        print("[guard-watchdog-telemetry] Aborting — original file left untouched.")
        return False

    with open(path, "w") as f:
        f.write(patched_source)

    print(f"[guard-watchdog-telemetry] Patched {patched_count} telemetry call(s) in {path}")
    return True


if __name__ == "__main__":
    path = find_watchdog_path()
    if not path:
        print("[guard-watchdog-telemetry] WARNING: watchdog.py not found. openhands-automation may not be installed.")
        print("[guard-watchdog-telemetry] Skipping patch (non-fatal).")
        sys.exit(0)

    print(f"[guard-watchdog-telemetry] Found watchdog at: {path}")
    success = patch_file(path)
    if not success:
        # Non-fatal — don't fail the Docker build
        sys.exit(0)
    print("[guard-watchdog-telemetry] Done.")

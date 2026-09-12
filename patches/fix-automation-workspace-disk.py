"""Build-time patch: stop automation presets from installing a 540 MB SDK venv per run.

Existing automations already have the old setup.sh baked into their tarballs;
runtime wrapping in automation_setup_rewrite.py covers those. This patch keeps
newly created preset automations from shipping the leaky installer at all.
"""

from __future__ import annotations

import glob
import importlib.util
import sys
from pathlib import Path


NEW_SETUP_SH = """#!/bin/bash
# Grokbot: reuse the host-wide shared SDK venv instead of installing
# openhands-sdk/tools/workspace into every run workspace (~540 MB each).
set -euo pipefail

HELPER="${GROKBOT_SHARED_VENV_HELPER:-/opt/agent-canvas/tools/ensure-shared-sdk-venv.sh}"
if [ -x "$HELPER" ]; then
  exec bash "$HELPER"
fi

echo "[setup] ERROR: shared SDK venv helper missing at ${HELPER}" >&2
exit 1
"""

MARKER = "# Grokbot: reuse the host-wide shared SDK venv"


def find_preset_setup_scripts() -> list[Path]:
    spec = importlib.util.find_spec("openhands.automation.presets")
    paths: list[Path] = []
    if spec and spec.origin:
        presets_dir = Path(spec.origin).parent
        paths.extend(presets_dir.glob("*/setup.sh"))
    paths.extend(
        Path(p)
        for p in glob.glob(
            "/usr/local/lib/python*/site-packages/openhands/automation/presets/*/setup.sh"
        )
    )
    # Deduplicate while preserving order
    seen: set[Path] = set()
    unique: list[Path] = []
    for path in paths:
        resolved = path.resolve()
        if resolved in seen:
            continue
        seen.add(resolved)
        unique.append(resolved)
    return unique


def patch_file(path: Path) -> bool:
    current = path.read_text()
    if MARKER in current:
        print(f"[fix-automation-workspace-disk] Already patched: {path}")
        return False
    path.write_text(NEW_SETUP_SH)
    path.chmod(0o755)
    print(f"[fix-automation-workspace-disk] Replaced {path}")
    return True


def main() -> int:
    scripts = find_preset_setup_scripts()
    if not scripts:
        print(
            "[fix-automation-workspace-disk] WARNING: preset setup.sh not found. "
            "openhands-automation may not be installed. Skipping patch (non-fatal)."
        )
        return 0

    patched = 0
    for path in scripts:
        if patch_file(path):
            patched += 1
    print(f"[fix-automation-workspace-disk] Done ({patched} file(s) patched).")
    return 0


if __name__ == "__main__":
    sys.exit(main())

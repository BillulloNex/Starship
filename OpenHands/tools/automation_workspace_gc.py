#!/usr/bin/env python3
"""Reclaim disk from leftover OpenHands automation run workspaces.

Local-mode automation writes one directory per run under
``$AUTOMATION_WORKSPACE_BASE/automation-runs/<run-id>/``. Upstream never
deletes these. Each run historically contained a ~540 MB ``.venv``, so the
tree grows by ~13 GB/day with no TTL.

This collector:

* deletes idle real ``.venv`` directories (not shared-venv symlinks)
* deletes whole run directories after a longer workspace TTL
* refuses to operate outside ``.../automation-runs/<uuid>/``
"""

from __future__ import annotations

import argparse
import logging
import os
import re
import shutil
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path


logger = logging.getLogger("automation_workspace_gc")

RUN_ID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)
AUTOMATION_RUNS_DIRNAME = "automation-runs"

DEFAULT_VENV_TTL_MINUTES = 15
DEFAULT_WORKSPACE_TTL_HOURS = 12
DEFAULT_LOOP_INTERVAL_SECONDS = 300


@dataclass(frozen=True)
class GcConfig:
    workspace_base: Path
    venv_ttl_seconds: float
    workspace_ttl_seconds: float
    now: float = field(default_factory=time.time)


@dataclass
class GcStats:
    scanned: int = 0
    venvs_removed: int = 0
    workspaces_removed: int = 0
    skipped: int = 0
    errors: int = 0


def env_int(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    return int(raw)


def resolve_workspace_base(explicit: str | None = None) -> Path:
    raw = explicit or os.environ.get("AUTOMATION_WORKSPACE_BASE") or ""
    if not raw:
        raw = os.path.join(os.path.expanduser("~"), ".openhands", "workspaces")
    return Path(os.path.expanduser(raw)).resolve()


def runs_root(workspace_base: Path) -> Path:
    return (workspace_base / AUTOMATION_RUNS_DIRNAME).resolve()


def is_run_dir(path: Path, root: Path) -> bool:
    try:
        resolved = path.resolve()
        resolved.relative_to(root)
    except (OSError, ValueError):
        return False
    return resolved.parent == root and bool(RUN_ID_RE.fullmatch(resolved.name))


def path_mtime(path: Path) -> float:
    try:
        return path.stat().st_mtime
    except OSError:
        return 0.0


def dir_age_seconds(path: Path, now: float) -> float:
    return max(0.0, now - path_mtime(path))


def is_real_venv(path: Path) -> bool:
    return path.name == ".venv" and path.is_dir() and not path.is_symlink()


def remove_path(path: Path) -> None:
    if path.is_symlink() or path.is_file():
        path.unlink()
    else:
        shutil.rmtree(path)


def collect_run_dirs(root: Path) -> list[Path]:
    if not root.is_dir():
        return []
    return [child for child in root.iterdir() if is_run_dir(child, root)]


def gc_run_dir(run_dir: Path, config: GcConfig, stats: GcStats) -> None:
    stats.scanned += 1
    venv = run_dir / ".venv"
    age = dir_age_seconds(run_dir, config.now)

    try:
        if age >= config.workspace_ttl_seconds:
            remove_path(run_dir)
            stats.workspaces_removed += 1
            logger.info("Removed idle automation workspace %s", run_dir)
            return

        if is_real_venv(venv) and dir_age_seconds(venv, config.now) >= config.venv_ttl_seconds:
            remove_path(venv)
            stats.venvs_removed += 1
            logger.info("Removed leftover automation .venv in %s", run_dir)
            return

        stats.skipped += 1
    except OSError:
        stats.errors += 1
        logger.exception("Failed to garbage-collect %s", run_dir)


def gc_once(config: GcConfig) -> GcStats:
    stats = GcStats()
    root = runs_root(config.workspace_base)
    if not root.is_dir():
        logger.info("No automation-runs directory at %s", root)
        return stats

    for run_dir in collect_run_dirs(root):
        gc_run_dir(run_dir, config, stats)
    return stats


def config_from_env(workspace_base: str | None = None, now: float | None = None) -> GcConfig:
    return GcConfig(
        workspace_base=resolve_workspace_base(workspace_base),
        venv_ttl_seconds=env_int(
            "AUTOMATION_VENV_TTL_MINUTES", DEFAULT_VENV_TTL_MINUTES
        )
        * 60,
        workspace_ttl_seconds=env_int(
            "AUTOMATION_WORKSPACE_TTL_HOURS", DEFAULT_WORKSPACE_TTL_HOURS
        )
        * 3600,
        now=time.time() if now is None else now,
    )


def _configure_logging() -> None:
    if logger.handlers:
        return
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("[automation-workspace-gc] %(message)s"))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False


def run_loop(interval_seconds: int) -> None:
    while True:
        stats = gc_once(config_from_env())
        logger.info(
            "GC pass: scanned=%d venvs_removed=%d workspaces_removed=%d "
            "skipped=%d errors=%d",
            stats.scanned,
            stats.venvs_removed,
            stats.workspaces_removed,
            stats.skipped,
            stats.errors,
        )
        time.sleep(interval_seconds)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--once", action="store_true", help="Run a single GC pass and exit")
    parser.add_argument("--loop", action="store_true", help="Run GC on an interval")
    parser.add_argument(
        "--interval",
        type=int,
        default=env_int(
            "AUTOMATION_WORKSPACE_GC_INTERVAL_SECONDS",
            DEFAULT_LOOP_INTERVAL_SECONDS,
        ),
        help="Loop interval in seconds (default: 300)",
    )
    parser.add_argument(
        "--workspace-base",
        default=None,
        help="Override AUTOMATION_WORKSPACE_BASE",
    )
    args = parser.parse_args(argv)
    _configure_logging()

    if args.loop and args.once:
        parser.error("choose either --once or --loop")

    if args.loop:
        logger.info(
            "Workspace GC loop started (interval=%ss, base=%s)",
            args.interval,
            resolve_workspace_base(args.workspace_base),
        )
        run_loop(args.interval)
        return 0

    stats = gc_once(config_from_env(args.workspace_base))
    logger.info(
        "GC pass: scanned=%d venvs_removed=%d workspaces_removed=%d "
        "skipped=%d errors=%d",
        stats.scanned,
        stats.venvs_removed,
        stats.workspaces_removed,
        stats.skipped,
        stats.errors,
    )
    return 0 if stats.errors == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())

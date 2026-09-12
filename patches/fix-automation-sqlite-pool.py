"""Build-time patch: SQLite automations DB must not use QueuePool.

openhands-automation's `_create_sqlite_engine` comments "no pooling" but never
sets poolclass=NullPool. SQLAlchemy 2.0.38+ defaults file SQLite to
AsyncAdaptedQueuePool(size=5, overflow=10). The automations dashboard then
fans out one /runs query per automation and checkouts wait 30s:

    sqlalchemy.exc.TimeoutError: QueuePool limit of size 5 overflow 10 reached

NullPool + WAL + busy_timeout lets concurrent reads proceed without a 15-slot
cap. Idempotent: skips when the GROKBOT marker is already present.
"""

from __future__ import annotations

import glob
import importlib.util
import sys
from pathlib import Path


MARKER = "# GROKBOT-SQLITE-POOL: NullPool + WAL"

PATCHED_FUNCTION = '''def _create_sqlite_engine(db_url: str) -> EngineResult:
    """Create SQLite engine for local deployments.

    SQLite configuration notes:
    - Uses aiosqlite driver for async support
    - NullPool: one connection per checkout (SQLAlchemy 2.0.38+ would
      otherwise use AsyncAdaptedQueuePool of size 5 + overflow 10)
    - WAL + busy_timeout so concurrent dashboard reads do not serialize
      behind a single writer lock
    - check_same_thread=False required for async usage
    """
    from sqlalchemy import event
    from sqlalchemy.pool import NullPool

    # GROKBOT-SQLITE-POOL: NullPool + WAL
    if not db_url.startswith("sqlite+aiosqlite"):
        db_url = db_url.replace("sqlite://", "sqlite+aiosqlite://", 1)

    engine = create_async_engine(
        db_url,
        connect_args={"check_same_thread": False, "timeout": 30},
        poolclass=NullPool,
    )

    @event.listens_for(engine.sync_engine, "connect")
    def _grokbot_sqlite_pragmas(dbapi_connection, connection_record):  # noqa: ARG001
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA busy_timeout=30000")
            cursor.execute("PRAGMA synchronous=NORMAL")
        finally:
            cursor.close()

    logger.info("Created SQLite engine: %s", db_url.split("?")[0])
    return EngineResult(engine=engine, is_sqlite=True)
'''


def find_db_paths() -> list[Path]:
    paths: list[Path] = []
    spec = importlib.util.find_spec("openhands.automation.db")
    if spec and spec.origin:
        paths.append(Path(spec.origin))
    paths.extend(
        Path(p)
        for p in glob.glob(
            "/usr/local/lib/python*/site-packages/openhands/automation/db.py"
        )
    )
    seen: set[Path] = set()
    unique: list[Path] = []
    for path in paths:
        resolved = path.resolve()
        if resolved in seen:
            continue
        seen.add(resolved)
        unique.append(resolved)
    return unique


def replace_create_sqlite_engine(source: str) -> str | None:
    start = source.find("def _create_sqlite_engine")
    if start < 0:
        return None
    next_defs = [
        source.find("\nasync def _create_gcp_engine", start + 1),
        source.find("\ndef create_session_factory", start + 1),
    ]
    end_candidates = [i for i in next_defs if i >= 0]
    if not end_candidates:
        return None
    end = min(end_candidates)
    # Keep the leading newline of the next def.
    return source[:start] + PATCHED_FUNCTION + source[end:]


def patch_file(path: Path) -> bool:
    current = path.read_text()
    if MARKER in current:
        print(f"[fix-automation-sqlite-pool] Already patched: {path}")
        return False
    patched = replace_create_sqlite_engine(current)
    if patched is None:
        print(
            f"[fix-automation-sqlite-pool] WARNING: _create_sqlite_engine not found in {path}, skipping"
        )
        return False
    path.write_text(patched)
    print(f"[fix-automation-sqlite-pool] Replaced {path}")
    return True


def main() -> int:
    paths = find_db_paths()
    if not paths:
        print(
            "[fix-automation-sqlite-pool] WARNING: openhands.automation.db not found. "
            "Skipping patch (non-fatal)."
        )
        return 0

    patched = 0
    for path in paths:
        if patch_file(path):
            patched += 1
    print(f"[fix-automation-sqlite-pool] Done ({patched} file(s) patched).")
    return 0


if __name__ == "__main__":
    sys.exit(main())

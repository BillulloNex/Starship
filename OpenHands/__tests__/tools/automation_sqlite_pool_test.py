"""Patch openhands-automation's SQLite engine to NullPool + WAL."""

from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path


def load_patcher():
    path = (
        Path(__file__).resolve().parents[3]
        / "patches"
        / "fix-automation-sqlite-pool.py"
    )
    spec = importlib.util.spec_from_file_location("fix_automation_sqlite_pool", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


ORIGINAL_DB = '''
from sqlalchemy.ext.asyncio import create_async_engine


def _create_sqlite_engine(db_url: str) -> EngineResult:
    """Create SQLite engine for local deployments.

    SQLite configuration notes:
    - Uses aiosqlite driver for async support
    - No connection pooling (SQLite handles this internally)
    - check_same_thread=False required for async usage
    """
    # Ensure the URL uses aiosqlite driver
    if not db_url.startswith("sqlite+aiosqlite"):
        db_url = db_url.replace("sqlite://", "sqlite+aiosqlite://", 1)

    engine = create_async_engine(
        db_url,
        # SQLite-specific settings
        connect_args={"check_same_thread": False},
        # No pooling for SQLite - it handles this internally
        pool_pre_ping=True,
    )
    logger.info("Created SQLite engine: %s", db_url.split("?")[0])
    return EngineResult(engine=engine, is_sqlite=True)


async def _create_gcp_engine(settings: ServiceSettings) -> EngineResult:
    return EngineResult(engine=None, is_sqlite=False)
'''


class FixAutomationSqlitePoolTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.patcher = load_patcher()

    def test_replaces_queuepool_sqlite_engine_with_nullpool_and_wal(self) -> None:
        patched = self.patcher.replace_create_sqlite_engine(ORIGINAL_DB)
        assert patched is not None
        self.assertIn("poolclass=NullPool", patched)
        self.assertIn("PRAGMA journal_mode=WAL", patched)
        self.assertIn("PRAGMA busy_timeout=30000", patched)
        self.assertIn(self.patcher.MARKER, patched)
        self.assertIn("async def _create_gcp_engine", patched)
        self.assertNotIn(
            "No pooling for SQLite - it handles this internally", patched
        )

    def test_is_idempotent_on_disk(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "db.py"
            path.write_text(ORIGINAL_DB)
            self.assertTrue(self.patcher.patch_file(path))
            self.assertFalse(self.patcher.patch_file(path))
            text = path.read_text()
            self.assertEqual(text.count("poolclass=NullPool"), 1)
            self.assertEqual(text.count(self.patcher.MARKER), 1)


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import os
import stat
import time
from pathlib import Path

import automation_setup_rewrite as rewrite
import automation_workspace_gc as gc


def test_rewrite_skips_when_wrapper_missing(tmp_path: Path) -> None:
    cmd = "cd /tmp && ([ ! -f setup.sh ] || bash setup.sh) && .venv/bin/python main.py"
    missing = tmp_path / "missing.sh"
    assert rewrite.rewrite_setup_command(cmd, wrapper=str(missing)) == cmd


def test_rewrite_replaces_bash_setup_sh(tmp_path: Path) -> None:
    wrapper = tmp_path / "run-automation-setup.sh"
    wrapper.write_text("#!/bin/bash\n")
    cmd = (
        "mkdir -p /ws && tar xzf /tmp/t.tgz -C /ws && cd /ws"
        " && ([ ! -f setup.sh ] || bash setup.sh) && .venv/bin/python main.py"
    )
    rewritten = rewrite.rewrite_setup_command(cmd, wrapper=str(wrapper))
    assert "bash setup.sh" not in rewritten
    assert f"bash {wrapper}" in rewritten
    assert rewritten.count("run-automation-setup.sh") == 1
    assert rewrite.rewrite_setup_command(rewritten, wrapper=str(wrapper)) == rewritten


def _age(path: Path, age_seconds: float) -> None:
    old = time.time() - age_seconds
    os.utime(path, (old, old))


def test_gc_removes_stale_real_venv_but_keeps_symlink(tmp_path: Path) -> None:
    shared = tmp_path / "shared"
    shared.mkdir()
    (shared / "py").write_text("shared")
    root = tmp_path / "workspaces" / "automation-runs"
    stale_id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    fresh_id = "11111111-2222-3333-4444-555555555555"
    symlink_id = "99999999-8888-7777-6666-555555555555"

    stale = root / stale_id
    stale.mkdir(parents=True)
    stale_venv = stale / ".venv"
    stale_venv.mkdir()
    (stale_venv / "lib").mkdir()
    (stale_venv / "lib" / "pkg").write_text("big")
    _age(stale, 60)
    _age(stale_venv, 60)

    fresh = root / fresh_id
    fresh.mkdir(parents=True)
    (fresh / ".venv").mkdir()
    (fresh / ".venv" / "keep").write_text("new")

    linked = root / symlink_id
    linked.mkdir(parents=True)
    os.symlink(shared, linked / ".venv")
    _age(linked, 60)

    now = time.time()
    stats = gc.gc_once(
        gc.GcConfig(
            workspace_base=tmp_path / "workspaces",
            venv_ttl_seconds=15,
            workspace_ttl_seconds=3600,
            now=now,
        )
    )

    assert stats.venvs_removed == 1
    assert stats.workspaces_removed == 0
    assert not stale_venv.exists()
    assert (fresh / ".venv" / "keep").is_file()
    assert (linked / ".venv").is_symlink()
    assert (shared / "py").is_file()


def test_gc_removes_idle_workspace_and_ignores_non_uuid(tmp_path: Path) -> None:
    root = tmp_path / "workspaces" / "automation-runs"
    old_id = "12345678-1234-1234-1234-1234567890ab"
    old_dir = root / old_id
    old_dir.mkdir(parents=True)
    (old_dir / "repo").mkdir()
    (old_dir / "repo" / "file").write_text("x")
    _age(old_dir, 48 * 3600)

    decoy = root / "not-a-uuid"
    decoy.mkdir(parents=True)
    (decoy / "keep").write_text("safe")
    _age(decoy, 48 * 3600)

    stats = gc.gc_once(
        gc.GcConfig(
            workspace_base=tmp_path / "workspaces",
            venv_ttl_seconds=15,
            workspace_ttl_seconds=12 * 3600,
            now=time.time(),
        )
    )

    assert stats.workspaces_removed == 1
    assert not old_dir.exists()
    assert (decoy / "keep").is_file()


def test_gc_refuses_paths_outside_automation_runs(tmp_path: Path) -> None:
    base = tmp_path / "workspaces"
    outsider = base / "other" / "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    outsider.mkdir(parents=True)
    root = gc.runs_root(base)
    root.mkdir(parents=True)
    assert not gc.is_run_dir(outsider, root)


def test_uv_shim_is_executable() -> None:
    shim = Path(__file__).resolve().parents[2] / "tools" / "uv-shim" / "uv"
    assert shim.is_file()
    mode = shim.stat().st_mode
    assert mode & stat.S_IXUSR


def test_uv_shim_skips_sdk_venv_and_passes_other_commands(tmp_path: Path) -> None:
    import subprocess

    shim = Path(__file__).resolve().parents[2] / "tools" / "uv-shim" / "uv"
    fake_uv = tmp_path / "uv"
    fake_uv.write_text("#!/bin/sh\nprintf 'REAL:%s\\n' \"$*\"\n")
    fake_uv.chmod(0o755)
    env = {**os.environ, "PATH": f"{tmp_path}{os.pathsep}{os.environ.get('PATH', '')}"}

    skipped = subprocess.run(
        [str(shim), "venv", ".venv", "--python", ">=3.12"],
        check=True,
        capture_output=True,
        text=True,
        env=env,
    )
    assert "Skipping uv venv" in skipped.stdout

    skipped_pip = subprocess.run(
        [
            str(shim),
            "pip",
            "install",
            "--quiet",
            "openhands-sdk==1.40.1",
            "openhands-tools==1.40.1",
            "openhands-workspace==1.40.1",
        ],
        check=True,
        capture_output=True,
        text=True,
        env=env,
    )
    assert "Skipping uv pip install" in skipped_pip.stdout

    passed = subprocess.run(
        [str(shim), "pip", "install", "requests"],
        check=True,
        capture_output=True,
        text=True,
        env=env,
    )
    assert "REAL:pip install requests" in passed.stdout


if __name__ == "__main__":
    import tempfile

    tests = [
        test_rewrite_skips_when_wrapper_missing,
        test_rewrite_replaces_bash_setup_sh,
        test_gc_removes_stale_real_venv_but_keeps_symlink,
        test_gc_removes_idle_workspace_and_ignores_non_uuid,
        test_gc_refuses_paths_outside_automation_runs,
        test_uv_shim_is_executable,
        test_uv_shim_skips_sdk_venv_and_passes_other_commands,
    ]
    for test in tests:
        if test.__code__.co_argcount:
            with tempfile.TemporaryDirectory() as tmp:
                test(Path(tmp))
        else:
            test()
        print(f"ok {test.__name__}")
    print("ok")

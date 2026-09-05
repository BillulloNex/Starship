#!/usr/bin/env bash
# One-shot OpenCode ACP handshake so the next conversation spawn hits a warm
# Bun/SQLite/module cache. MCP is not registered here (no session/new).
set -u
export OPENCODE_PURE=1
export OPENCODE_CLIENT=acp

python3 - <<'PY'
import json
import subprocess
import sys
import time

req = (
    json.dumps(
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": 1,
                "clientCapabilities": {},
                "clientInfo": {"name": "grokbot-prewarm", "version": "0"},
            },
        }
    )
    + "\n"
)

try:
    proc = subprocess.Popen(
        ["opencode", "acp"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
except FileNotFoundError:
    print("opencode-acp-prewarm: opencode not on PATH", file=sys.stderr)
    sys.exit(0)

assert proc.stdin is not None
assert proc.stdout is not None
try:
    proc.stdin.write(req.encode())
    proc.stdin.flush()
    deadline = time.time() + 40
    got = False
    while time.time() < deadline:
        line = proc.stdout.readline()
        if not line:
            break
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue
        if msg.get("id") == 1:
            got = True
            break
    print(
        "opencode-acp-prewarm: ok" if got else "opencode-acp-prewarm: no initialize reply",
        file=sys.stderr,
    )
finally:
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
PY

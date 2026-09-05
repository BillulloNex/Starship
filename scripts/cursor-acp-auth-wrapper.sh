#!/usr/bin/env bash
set -euo pipefail
set +x

# Cursor ACP Auth Wrapper for Starship
#
# Resolves the API key, then delegates to cursor-acp-bridge.mjs which
# implements the ACP JSON-RPC protocol using `agent -p` (print mode).
# This works around Cursor's buggy `agent acp` mode that returns
# "RetriableError: [internal] Failed to run step, exceeded max retries".

CURSOR_KEY="${CURSOR_API_KEY:-}"
if [ -z "$CURSOR_KEY" ]; then
  CURSOR_KEY="$(curl -fsS http://127.0.0.1:18000/api/settings/secrets/CURSOR_API_KEY)" || true
fi

if [ -z "$CURSOR_KEY" ]; then
  echo "CURSOR_API_KEY is unavailable" >&2
  exit 1
fi

export CURSOR_API_KEY="$CURSOR_KEY"

# Resolve the bridge script path (same directory as this wrapper)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRIDGE="$SCRIPT_DIR/cursor-acp-bridge.mjs"

# Fallback: look in /opt/agent-canvas (Docker container path)
if [ ! -f "$BRIDGE" ]; then
  BRIDGE="/opt/agent-canvas/cursor-acp-bridge.mjs"
fi

exec node "$BRIDGE"

#!/usr/bin/env bash
set -euo pipefail
set +x

# Cursor ACP Auth Wrapper for Starship
#
# Resolves the API key, then runs Cursor's native ACP server (`agent acp`)
# through cursor-acp-bridge.mjs, which remaps Cursor's `{id, name}` select
# options to ACP `{value, name}` so OpenHands can validate NewSessionResponse.
#
# Fallback: CURSOR_ACP_MODE=print uses `agent -p` instead of native ACP.

CURSOR_KEY="${CURSOR_API_KEY:-}"
if [ -z "$CURSOR_KEY" ]; then
  CURSOR_KEY="$(curl -fsS http://127.0.0.1:18000/api/settings/secrets/CURSOR_API_KEY)" || true
fi

if [ -z "$CURSOR_KEY" ]; then
  echo "CURSOR_API_KEY is unavailable" >&2
  exit 1
fi

export CURSOR_API_KEY="$CURSOR_KEY"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRIDGE="$SCRIPT_DIR/cursor-acp-bridge.mjs"

if [ ! -f "$BRIDGE" ]; then
  BRIDGE="/opt/agent-canvas/cursor-acp-bridge.mjs"
fi

exec node "$BRIDGE"

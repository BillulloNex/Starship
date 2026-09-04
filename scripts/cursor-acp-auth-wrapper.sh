#!/usr/bin/env bash
set -euo pipefail
set +x

# Cursor's ACP subprocess does not inherit Agent Canvas secrets automatically.
# Resolve the API key at launch without logging it, then pass it through the
# CLI's supported non-interactive authentication flag.
CURSOR_KEY="${CURSOR_API_KEY:-}"
if [ -z "$CURSOR_KEY" ]; then
  CURSOR_KEY="$(curl -fsS http://127.0.0.1:18000/api/settings/secrets/CURSOR_API_KEY)"
fi

if [ -z "$CURSOR_KEY" ]; then
  echo "CURSOR_API_KEY is unavailable" >&2
  exit 1
fi

exec agent --api-key "$CURSOR_KEY" acp

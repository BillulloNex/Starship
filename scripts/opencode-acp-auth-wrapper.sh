#!/usr/bin/env bash
set -euo pipefail
set +x

# OpenCode ACP subprocess auth wrapper.
# Resolves OPENCODE_AUTH_JSON or API keys from environment or Agent Server secret store,
# materializes credentials to ~/.local/share/opencode/auth.json so Go / paid models
# are in the ACP catalog (session/set_model cannot see env-only keys on 1.18.x),
# disables compaction auto-continue, and starts the ACP server in yolo mode (--auto).

SECRETS_URL="http://127.0.0.1:18000/api/settings/secrets"

fetch_secret() {
  local secret_name="$1"
  curl -fsS "${SECRETS_URL}/${secret_name}" 2>/dev/null || true
}

# 1. Materialize OPENCODE_AUTH_JSON if available
AUTH_JSON="${OPENCODE_AUTH_JSON:-}"
if [ -z "$AUTH_JSON" ]; then
  AUTH_JSON="$(fetch_secret "OPENCODE_AUTH_JSON")"
fi

if [ -z "${OPENCODE_GO_API_KEY:-}" ]; then
  VAL="$(fetch_secret "OPENCODE_GO_API_KEY")"
  if [ -n "$VAL" ]; then
    export OPENCODE_GO_API_KEY="$VAL"
  fi
fi

if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  VAL="$(fetch_secret "ANTHROPIC_API_KEY")"
  if [ -n "$VAL" ]; then
    export ANTHROPIC_API_KEY="$VAL"
  fi
fi

if [ -z "${OPENAI_API_KEY:-}" ]; then
  VAL="$(fetch_secret "OPENAI_API_KEY")"
  if [ -n "$VAL" ]; then
    export OPENAI_API_KEY="$VAL"
  fi
fi

if [ -z "${GEMINI_API_KEY:-}" ]; then
  VAL="$(fetch_secret "GEMINI_API_KEY")"
  if [ -n "$VAL" ]; then
    export GEMINI_API_KEY="$VAL"
  fi
fi

OPENCODE_DIR="${HOME}/.local/share/opencode"
OPENCODE_CONFIG_DIR="${HOME}/.config/opencode"
mkdir -p "$OPENCODE_DIR" "$OPENCODE_CONFIG_DIR"

# Merge env/API keys into auth.json. OpenCode ACP session/set_model looks up
# models from providers loaded via this file; OPENCODE_GO_API_KEY alone is not
# enough for opencode-go/* to appear, which silently falls back to big-pickle.
python3 - "$OPENCODE_DIR/auth.json" "$AUTH_JSON" <<'PY'
import json
import os
import sys
from pathlib import Path

auth_path = Path(sys.argv[1])
blob = sys.argv[2] if len(sys.argv) > 2 else ""
data = {}
if auth_path.exists():
    try:
        loaded = json.loads(auth_path.read_text(encoding="utf-8") or "{}")
        if isinstance(loaded, dict):
            data = loaded
    except json.JSONDecodeError:
        pass
if blob.strip().startswith("{"):
    try:
        parsed = json.loads(blob)
        if isinstance(parsed, dict):
            data.update(parsed)
    except json.JSONDecodeError:
        pass

def put_api(provider: str, env_name: str) -> None:
    key = (os.environ.get(env_name) or "").strip()
    if not key:
        return
    existing = data.get(provider)
    if isinstance(existing, dict) and (existing.get("key") or "").strip():
        return
    data[provider] = {"type": "api", "key": key}

put_api("opencode-go", "OPENCODE_GO_API_KEY")
put_api("anthropic", "ANTHROPIC_API_KEY")
put_api("openai", "OPENAI_API_KEY")
put_api("google", "GEMINI_API_KEY")

auth_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
auth_path.chmod(0o600)
PY

# Compaction injects a synthetic user turn
# ("Continue if you have next steps...") which loops the agent in empty
# workspaces. Disable auto-compaction for ACP sessions.
python3 - "$OPENCODE_CONFIG_DIR/opencode.json" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
data = {}
if path.exists():
    try:
        loaded = json.loads(path.read_text(encoding="utf-8") or "{}")
        if isinstance(loaded, dict):
            data = loaded
    except json.JSONDecodeError:
        pass
compaction = data.get("compaction")
if not isinstance(compaction, dict):
    compaction = {}
compaction["auto"] = False
data["compaction"] = compaction
if "$schema" not in data:
    data["$schema"] = "https://opencode.ai/config.json"
path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
PY

exec opencode --auto "$@" acp

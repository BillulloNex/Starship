#!/usr/bin/env bash
set -euo pipefail
set +x

# OpenCode ACP subprocess auth wrapper.
# Resolves OPENCODE_AUTH_JSON or API keys from environment or Agent Server secret store,
# materializes credentials to ~/.local/share/opencode/auth.json if needed,
# and starts the ACP server in yolo mode (--auto).

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

if [ -n "$AUTH_JSON" ] && [[ "$AUTH_JSON" =~ ^\{ ]]; then
  OPENCODE_DIR="${HOME}/.local/share/opencode"
  mkdir -p "$OPENCODE_DIR"
  printf '%s\n' "$AUTH_JSON" > "${OPENCODE_DIR}/auth.json"
  chmod 600 "${OPENCODE_DIR}/auth.json"
fi

# 2. Export API keys if set in environment or secret store
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

exec opencode --auto "$@" acp

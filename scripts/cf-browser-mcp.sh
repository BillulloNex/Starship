#!/bin/bash
# Wrapper: sources CF credentials from the entrypoint-generated env file, then
# runs chrome-devtools-mcp against Cloudflare Browser Run.
#
# By default it goes through the Browser Run cookie vault
# (/opt/agent-canvas/browser-run-vault.mjs), a local CDP proxy that restores
# saved logins into every new Browser Run session and saves new ones back.
# BROWSER_VAULT_DISABLED=true connects chrome-devtools-mcp straight to Browser
# Run instead, with no saved logins.
set -euo pipefail
ENV_FILE="/tmp/cf-browser-env"
if [ -f "$ENV_FILE" ]; then
  source "$ENV_FILE"
fi
if [ -z "${CF_ACCOUNT_ID:-}" ] || [ -z "${CF_BROWSER_API_TOKEN:-}" ]; then
  echo "ERROR: CF_ACCOUNT_ID and CF_BROWSER_API_TOKEN not available. Check entrypoint." >&2
  exit 1
fi
WORKSPACE_ARGS=("--workspace=/home/openhands/workspace" "--workspace=/tmp")
VAULT_SCRIPT="/opt/agent-canvas/browser-run-vault.mjs"

if [ "${BROWSER_VAULT_DISABLED:-}" != "true" ] && [ -f "$VAULT_SCRIPT" ]; then
  exec node "$VAULT_SCRIPT" mcp "${WORKSPACE_ARGS[@]}" "$@"
fi

exec chrome-devtools-mcp \
  "--wsEndpoint=wss://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/browser-run/devtools/browser?keep_alive=600000" \
  "--wsHeaders={\"Authorization\":\"Bearer ${CF_BROWSER_API_TOKEN}\"}" \
  "${WORKSPACE_ARGS[@]}" \
  "$@"

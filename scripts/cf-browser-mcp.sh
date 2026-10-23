#!/bin/bash
# Wrapper: sources CF credentials from entrypoint-generated env file,
# then runs chrome-devtools-mcp with Cloudflare Browser Run endpoint.
set -euo pipefail
ENV_FILE="/tmp/cf-browser-env"
if [ -f "$ENV_FILE" ]; then
  source "$ENV_FILE"
fi
if [ -z "${CF_ACCOUNT_ID:-}" ] || [ -z "${CF_BROWSER_API_TOKEN:-}" ]; then
  echo "ERROR: CF_ACCOUNT_ID and CF_BROWSER_API_TOKEN not available. Check entrypoint." >&2
  exit 1
fi
exec npx -y chrome-devtools-mcp@latest \
  "--wsEndpoint=wss://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/browser-run/devtools/browser?keep_alive=600000" \
  "--wsHeaders={\"Authorization\":\"Bearer ${CF_BROWSER_API_TOKEN}\"}" \
  "$@"

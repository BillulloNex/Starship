#!/usr/bin/env bash
# Git credential helper for github.com. Resolves a live OAuth / GitHub App
# token (refreshing if needed) so `git push https://github.com/...` works
# without embedding secrets in the remote URL.
set -euo pipefail

ACTION="${1:-}"
if [ "$ACTION" != "get" ]; then
  exit 0
fi

host=""
while IFS= read -r line || [ -n "$line" ]; do
  [ -z "$line" ] && break
  case "$line" in
    host=*) host="${line#host=}" ;;
  esac
done

case "$host" in
  github.com|gist.github.com) ;;
  *) exit 0 ;;
esac

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f /opt/agent-canvas/github-oauth.mjs ]; then
  OAUTH_JS=/opt/agent-canvas/github-oauth.mjs
elif [ -f "$SCRIPT_DIR/github-oauth.mjs" ]; then
  OAUTH_JS="$SCRIPT_DIR/github-oauth.mjs"
else
  OAUTH_JS=""
fi

token=""
if [ -n "$OAUTH_JS" ] && command -v node >/dev/null 2>&1; then
  # Sandbox GITHUB_TOKEN is often an expired GitHub App user token that would
  # skip refresh. Resolve from github-connection.json instead.
  token="$(
    env -u GITHUB_TOKEN -u GITHUB_PERSONAL_ACCESS_TOKEN -u GH_TOKEN \
      node "$OAUTH_JS" credential-token 2>/dev/null || true
  )"
fi
if [ -z "$token" ]; then
  token="${GITHUB_TOKEN:-${GITHUB_PERSONAL_ACCESS_TOKEN:-${GH_TOKEN:-}}}"
fi

if [ -z "$token" ]; then
  exit 0
fi

printf 'username=x-access-token\npassword=%s\n' "$token"

#!/usr/bin/env bash
# Git credential helper for github.com. Prints an OAuth / GitHub App token so
# `git clone https://github.com/...` works in the web console with no TTY.
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

token="${GITHUB_TOKEN:-${GITHUB_PERSONAL_ACCESS_TOKEN:-${GH_TOKEN:-}}}"
if [ -z "$token" ]; then
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  if [ -f /opt/agent-canvas/github-oauth.mjs ]; then
    OAUTH_JS=/opt/agent-canvas/github-oauth.mjs
  elif [ -f "$SCRIPT_DIR/github-oauth.mjs" ]; then
    OAUTH_JS="$SCRIPT_DIR/github-oauth.mjs"
  else
    OAUTH_JS=""
  fi
  if [ -n "$OAUTH_JS" ]; then
    token="$(node "$OAUTH_JS" credential-token 2>/dev/null || true)"
  fi
fi

if [ -z "$token" ]; then
  exit 0
fi

printf 'username=x-access-token\npassword=%s\n' "$token"

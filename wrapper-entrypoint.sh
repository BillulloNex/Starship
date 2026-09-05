#!/usr/bin/env bash
# Wrapper entrypoint for GrokBot
# Fixes file ownership on mounted volumes before dropping to openhands user.
# This is needed because the old container ran as root, so persisted files
# are owned by root:root (UID 0). The new container runs as openhands (UID 1000).

set -uo pipefail

OPENHANDS_DIR="/home/openhands/.openhands"
CURSOR_DIR="/home/openhands/.cursor"
OPENCODE_DIR="/home/openhands/.local/share/opencode"

# Ensure /projects directory exists
mkdir -p /projects

# Auto-seed repository into /projects/Grokbot if missing
AUTO_REPO="${AUTO_CLONE_REPO:-https://github.com/ThomasVuNguyen/Starship.git}"
TARGET_DIR="${AUTO_CLONE_TARGET:-/projects/Grokbot}"

if [ -n "${AUTO_REPO}" ] && [ ! -d "${TARGET_DIR}/.git" ]; then
  echo "[grokbot-wrapper] Auto-seeding workspace ${TARGET_DIR} from ${AUTO_REPO}..."
  mkdir -p "$(dirname "$TARGET_DIR")"
  
  CLONE_URL="$AUTO_REPO"
  GH_AUTH_TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
  if [ -n "$GH_AUTH_TOKEN" ] && [[ "$AUTO_REPO" =~ ^https://github.com/ ]]; then
    CLONE_URL="https://x-access-token:${GH_AUTH_TOKEN}@${AUTO_REPO#https://}"
  fi
  
  git clone "$CLONE_URL" "$TARGET_DIR" 2>/dev/null || git clone "$AUTO_REPO" "$TARGET_DIR" 2>/dev/null || echo "[grokbot-wrapper] Auto-clone skipped or failed."
fi

# Fix ownership on the mounted volume if running as root
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$CURSOR_DIR" "$OPENCODE_DIR"

  # Fast ownership fix: only recursively chown if the target directory is currently owned by root (UID 0)
  for dir in "$OPENHANDS_DIR" "$CURSOR_DIR" "$OPENCODE_DIR" /projects /root/workspace; do
    if [ -d "$dir" ]; then
      owner_uid="$(stat -c '%u' "$dir" 2>/dev/null || echo "0")"
      if [ "$owner_uid" = "0" ]; then
        echo "[grokbot-wrapper] Fixing root ownership on $dir..."
        chown -R openhands:openhands "$dir" 2>/dev/null || true
      fi
    fi
  done

  # The old container stored workspaces at /root/workspace/. Conversations
  # reference these paths. Make /root accessible and create the workspace
  # directory if it doesn't exist (it won't in the new base image).
  chmod 755 /root
  mkdir -p /root/workspace
  if [ "$(stat -c '%u' /root/workspace 2>/dev/null || echo "0")" = "0" ]; then
    chown -R openhands:openhands /root/workspace 2>/dev/null || true
  fi

  # Start D-Bus system service if installed
  if [ -x /etc/init.d/dbus ]; then
    /etc/init.d/dbus start >/dev/null 2>&1 || true
  fi

  # Drop privileges and re-exec as openhands
  exec su -s /bin/bash openhands -c "node /opt/agent-canvas/ship-jira-orchestrator.mjs >> /home/openhands/.openhands/ship-automation.log 2>&1 & node /opt/agent-canvas/ship-log-monitor-orchestrator.mjs >> /home/openhands/.openhands/ship-log-monitor.log 2>&1 & exec tini -- /opt/agent-canvas/entrypoint.sh"
else
  # Already running as openhands — just exec the real entrypoint
  node /opt/agent-canvas/ship-jira-orchestrator.mjs >> /home/openhands/.openhands/ship-automation.log 2>&1 &
  node /opt/agent-canvas/ship-log-monitor-orchestrator.mjs >> /home/openhands/.openhands/ship-log-monitor.log 2>&1 &
  exec /opt/agent-canvas/entrypoint.sh
fi

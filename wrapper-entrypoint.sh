#!/usr/bin/env bash
# Wrapper entrypoint for GrokBot
# Fixes file ownership on mounted volumes before dropping to openhands user.
# This is needed because the old container ran as root, so persisted files
# are owned by root:root (UID 0). The new container runs as openhands (UID 1000).

set -uo pipefail

OPENHANDS_DIR="/home/openhands/.openhands"
CURSOR_DIR="/home/openhands/.cursor"
OPENCODE_DIR="/home/openhands/.local/share/opencode"

# Ensure directories exist
mkdir -p /projects "$CURSOR_DIR" "$OPENCODE_DIR"

# Auto-seed repository in background if missing so it does not block container startup
AUTO_REPO="${AUTO_CLONE_REPO:-https://github.com/BillulloNex/Starship.git}"
TARGET_DIR="${AUTO_CLONE_TARGET:-/projects/Grokbot}"

if [ -n "${AUTO_REPO}" ] && [ ! -d "${TARGET_DIR}/.git" ]; then
  (
    echo "[grokbot-wrapper] Auto-seeding workspace ${TARGET_DIR} from ${AUTO_REPO} in background..."
    mkdir -p "$(dirname "$TARGET_DIR")"
    CLONE_URL="$AUTO_REPO"
    GH_AUTH_TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
    if [ -n "$GH_AUTH_TOKEN" ] && [[ "$AUTO_REPO" =~ ^https://github.com/ ]]; then
      CLONE_URL="https://x-access-token:${GH_AUTH_TOKEN}@${AUTO_REPO#https://}"
    fi
    git clone --depth 1 "$CLONE_URL" "$TARGET_DIR" 2>/dev/null || git clone --depth 1 "$AUTO_REPO" "$TARGET_DIR" 2>/dev/null || echo "[grokbot-wrapper] Auto-clone skipped or failed."
    chown -R openhands:openhands "$TARGET_DIR" 2>/dev/null || true
  ) &
fi

# Fix ownership quickly without blocking startup
if [ "$(id -u)" = "0" ]; then
  chown openhands:openhands "$OPENHANDS_DIR" "$CURSOR_DIR" "$OPENCODE_DIR" /projects /home/openhands 2>/dev/null || true
  chmod 755 /root
  mkdir -p /root/workspace
  chown openhands:openhands /root /root/workspace 2>/dev/null || true

  # Ensure persistent skills directory and symlink for npx skills CLI
  mkdir -p "$OPENHANDS_DIR/skills" /home/openhands/.agents
  if [ ! -e /home/openhands/.agents/skills ]; then
    ln -s "$OPENHANDS_DIR/skills" /home/openhands/.agents/skills 2>/dev/null || true
  fi
  chown -R openhands:openhands "$OPENHANDS_DIR/skills" /home/openhands/.agents 2>/dev/null || true

  # Asynchronous background chown for user config dirs
  (chown -R openhands:openhands /home/openhands/.local "$CURSOR_DIR" "$OPENCODE_DIR" 2>/dev/null || true) &

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

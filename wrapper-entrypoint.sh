#!/usr/bin/env bash
# Wrapper entrypoint for GrokBot
# Fixes file ownership on mounted volumes before dropping to openhands user.
# This is needed because the old container ran as root, so persisted files
# are owned by root:root (UID 0). The new container runs as openhands (UID 1000).

set -uo pipefail

OPENHANDS_DIR="/home/openhands/.openhands"

# Fix ownership on the mounted volume if running as root
if [ "$(id -u)" = "0" ]; then
  echo "[grokbot-wrapper] Fixing ownership on $OPENHANDS_DIR..."
  chown -R openhands:openhands "$OPENHANDS_DIR" /projects 2>/dev/null || true

  # The old container stored workspaces at /root/workspace/. Conversations
  # reference these paths. Make them accessible to the openhands user.
  if [ -d /root/workspace ]; then
    echo "[grokbot-wrapper] Fixing ownership on /root/workspace (legacy)..."
    chmod 755 /root
    chown -R openhands:openhands /root/workspace 2>/dev/null || true
  fi

  # Drop privileges and re-exec as openhands
  exec su -s /bin/bash openhands -c "exec tini -- /opt/agent-canvas/entrypoint.sh"
else
  # Already running as openhands — just exec the real entrypoint
  exec /opt/agent-canvas/entrypoint.sh
fi

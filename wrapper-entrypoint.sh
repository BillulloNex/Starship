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
  # Drop privileges and re-exec as openhands
  exec su -s /bin/bash openhands -c "exec tini -- /opt/agent-canvas/entrypoint.sh"
else
  # Already running as openhands — just exec the real entrypoint
  exec /opt/agent-canvas/entrypoint.sh
fi

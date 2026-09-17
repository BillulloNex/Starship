#!/usr/bin/env bash
# deploy-fast.sh — Fast Mode: sync frontend assets into the running Starship
# container on Lenovo over Tailscale. Zero container restart, zero Python
# cold-start. ~7-10 seconds end-to-end.
#
# Usage:
#   ./scripts/deploy-fast.sh              # deploy frontend
#   ./scripts/deploy-fast.sh --rollback   # restore previous frontend
set -euo pipefail

TARGET_HOST="${STARSHIP_HOST:-100.77.63.10}" # Lenovo on Tailscale
COOLIFY_APP_ID="b13aardv73k5fyl01a80ggzc"

# ── Helper: find running container on remote host ────────────────────────────
get_container_id() {
  ssh "thomasthemaker@${TARGET_HOST}" "
    CID=\$(docker ps --filter 'label=coolify.applicationId=${COOLIFY_APP_ID}' -q | head -n 1)
    if [ -z \"\$CID\" ]; then
      CID=\$(docker ps --filter 'publish=8000' -q | head -n 1)
    fi
    echo \"\$CID\"
  "
}

# ── ROLLBACK ─────────────────────────────────────────────────────────────────
if [ "${1:-}" = "--rollback" ]; then
  echo "⏪ Rolling back Starship frontend to previous backup..."
  CONTAINER_ID=$(get_container_id)
  if [ -z "$CONTAINER_ID" ]; then
    echo "❌ Error: Could not find Starship container on ${TARGET_HOST}"
    exit 1
  fi
  ssh "thomasthemaker@${TARGET_HOST}" "
    docker exec '${CONTAINER_ID}' sh -c '
      if [ ! -d /opt/agent-canvas/frontend-backup ]; then
        echo \"❌ No frontend-backup snapshot found inside container.\"
        exit 1
      fi
      rm -rf /opt/agent-canvas/frontend-cur
      mv /opt/agent-canvas/frontend /opt/agent-canvas/frontend-cur
      mv /opt/agent-canvas/frontend-backup /opt/agent-canvas/frontend
      rm -rf /opt/agent-canvas/frontend-cur
      echo \"✅ Rollback complete inside container.\"
    '
  "
  echo "✅ Rollback complete! Live at https://ship.beenex.org"
  exit 0
fi

# ── 1. DIFF GUARD ────────────────────────────────────────────────────────────
# Check committed, uncommitted, and staged changes for files that require a
# full Normal Mode deploy (container rebuild).
echo "🔍 Checking diff safety..."
CHANGED_SYSTEM_FILES=$(
  {
    git diff --name-only origin/main 2>/dev/null || true
    git diff --name-only                                  # uncommitted working tree
    git diff --name-only --cached                         # staged changes
  } | sort -u | grep -E 'Dockerfile|package-lock\.json|wrapper-entrypoint\.sh|entrypoint\.sh|patches/|\.py$' || true
)

if [ -n "$CHANGED_SYSTEM_FILES" ]; then
  echo "⚠️  System, Python, or dependency files modified:"
  echo "$CHANGED_SYSTEM_FILES"
  echo "❌ Fast Mode only deploys frontend code. Please use Normal Mode (git push origin main)."
  exit 1
fi

START_TIME=$(date +%s)

# ── 2. LOCAL VITE BUILD ──────────────────────────────────────────────────────
echo "⚡ Compiling frontend with production telemetry..."
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}/OpenHands"

# Warn if .env.production.local is missing (observability keys won't be embedded)
if [ ! -f .env.production.local ] && [ ! -f .env.production ]; then
  echo "⚠️  .env.production.local missing in OpenHands/. Observability keys may not be embedded."
fi

npm run build
cd "${REPO_ROOT}"

# ── 3. ATOMIC DEPLOY VIA SSH & DOCKER EXEC ───────────────────────────────────
echo "🚀 Transferring bundle to Starship container on Lenovo (${TARGET_HOST})..."
CONTAINER_ID=$(get_container_id)
if [ -z "$CONTAINER_ID" ]; then
  echo "❌ Error: Starship container not found on host."
  exit 1
fi

DEPLOY_MARKER="$(git rev-parse HEAD 2>/dev/null || echo 'manual')+fast-$(date +%s)"

# Stream gzip archive directly into docker exec tar extraction inside staging dir.
# The first two docker exec calls (rm, mkdir) don't read stdin, so the tar data
# stays in the SSH pipe buffer until docker exec -i tar reads it.
tar -czf - -C OpenHands/build . | ssh "thomasthemaker@${TARGET_HOST}" "
  docker exec '${CONTAINER_ID}' rm -rf /opt/agent-canvas/frontend-new
  docker exec '${CONTAINER_ID}' mkdir -p /opt/agent-canvas/frontend-new
  docker exec -i '${CONTAINER_ID}' tar -xzf - -C /opt/agent-canvas/frontend-new
  docker exec '${CONTAINER_ID}' sh -c '
    # Backup existing frontend for rollback
    rm -rf /opt/agent-canvas/frontend-backup
    cp -a /opt/agent-canvas/frontend /opt/agent-canvas/frontend-backup 2>/dev/null || true

    # Atomic swap
    mv /opt/agent-canvas/frontend /opt/agent-canvas/frontend-old
    mv /opt/agent-canvas/frontend-new /opt/agent-canvas/frontend
    rm -rf /opt/agent-canvas/frontend-old

    # Write deploy audit marker
    echo \"${DEPLOY_MARKER}\" > /opt/agent-canvas/frontend/.deploy-sha
  '
"

ELAPSED=$(( $(date +%s) - START_TIME ))
echo "✅ Fast Mode deploy succeeded in ${ELAPSED}s!"
echo "📍 Version Marker: ${DEPLOY_MARKER}"
echo "🌐 Live at https://ship.beenex.org"

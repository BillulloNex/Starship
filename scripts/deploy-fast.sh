#!/usr/bin/env bash
# Fast In-Place Deploy Script (Syncs directly into running Docker container)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

TARGET_HOST="${STARSHIP_HOST:-100.77.63.10}"

if [ "${1:-}" = "--rollback" ]; then
  echo "⏪ Rolling back to previous frontend version..."
  ssh -o StrictHostKeyChecking=no "root@${TARGET_HOST}" "
    CONTAINER_ID=\$(docker ps -q -f name=b13aardv73k5fyl01a80ggzc || true)
    if [ -z \"\$CONTAINER_ID\" ]; then
      CONTAINER_ID=\$(docker ps -q -f name=starship || true)
    fi
    if [ -z \"\$CONTAINER_ID\" ]; then exit 1; fi
    docker exec \"\$CONTAINER_ID\" sh -c '
      rm -rf /opt/agent-canvas/frontend-old
      mv /opt/agent-canvas/frontend /opt/agent-canvas/frontend-old
      mv /opt/agent-canvas/frontend-backup /opt/agent-canvas/frontend
    '
    docker restart \"\$CONTAINER_ID\" > /dev/null
  "
  echo "✅ Rollback complete!"
  exit 0
fi

if [ -z "${GITHUB_ACTIONS:-}" ]; then
  CHANGED_SYSTEM_FILES=$(
    {
      git diff --name-only origin/main 2>/dev/null || true
      git diff --name-only
      git diff --name-only --cached
    } | sort -u | grep -E 'Dockerfile|package-lock\.json|wrapper-entrypoint\.sh|entrypoint\.sh|patches/' || true
  )

  if [ -n "$CHANGED_SYSTEM_FILES" ]; then
    echo "⚠️  WARNING: You have modified system/infrastructure files!"
    echo "Please use Normal Mode (git push origin main) to rebuild the Docker image."
    exit 1
  fi
fi

echo "🏗️  Building React Frontend locally..."
if [ -z "${GITHUB_ACTIONS:-}" ]; then
  npm --prefix OpenHands run build
fi

START_TIME=$(date +%s)
DEPLOY_MARKER="$(git rev-parse --short HEAD)+fast-$(date +%s)"

echo "🚀 Syncing UI and Python code into running container..."

TMP_ARCHIVE=$(mktemp /tmp/deploy-fast.XXXXXX.tar.gz)
mkdir -p /tmp/deploy-staging/scripts_flat
cp -a OpenHands/build /tmp/deploy-staging/frontend-new
cp -a OpenHands/tools /tmp/deploy-staging/tools
cp -a OpenHands/scripts/* /tmp/deploy-staging/scripts_flat/ 2>/dev/null || true
cp -a scripts/* /tmp/deploy-staging/scripts_flat/ 2>/dev/null || true

tar -czf "$TMP_ARCHIVE" -C /tmp/deploy-staging .

cat "$TMP_ARCHIVE" | ssh -o StrictHostKeyChecking=no "root@${TARGET_HOST}" "
  CONTAINER_ID=\$(docker ps -q -f name=b13aardv73k5fyl01a80ggzc || true)
  if [ -z \"\$CONTAINER_ID\" ]; then
    CONTAINER_ID=\$(docker ps -q -f name=starship || true)
  fi
  if [ -z \"\$CONTAINER_ID\" ]; then exit 1; fi

  docker exec '\${CONTAINER_ID}' rm -rf /tmp/deploy-staging
  docker exec '\${CONTAINER_ID}' mkdir -p /tmp/deploy-staging
  docker exec -i '\${CONTAINER_ID}' tar -xzf - -C /tmp/deploy-staging

  docker exec '\${CONTAINER_ID}' sh -c '
    rm -rf /opt/agent-canvas/frontend-backup
    cp -a /opt/agent-canvas/frontend /opt/agent-canvas/frontend-backup 2>/dev/null || true
    mv /opt/agent-canvas/frontend /opt/agent-canvas/frontend-old
    mv /tmp/deploy-staging/frontend-new /opt/agent-canvas/frontend
    rm -rf /opt/agent-canvas/frontend-old
    echo \"${DEPLOY_MARKER}\" > /opt/agent-canvas/frontend/.deploy-sha
  '

  docker exec '\${CONTAINER_ID}' sh -c '
    cp -a /tmp/deploy-staging/tools/* /opt/agent-canvas/tools/ 2>/dev/null || true
    cp -a /tmp/deploy-staging/scripts_flat/* /opt/agent-canvas/ 2>/dev/null || true
  '

  echo \"🔄 Bouncing container to restart Python workers...\"
  docker restart '\${CONTAINER_ID}' > /dev/null
"

rm "$TMP_ARCHIVE"
rm -rf /tmp/deploy-staging

ELAPSED=$(( $(date +%s) - START_TIME ))
echo "✅ Fast Mode deploy succeeded in ${ELAPSED}s!"
echo "📍 Version Marker: ${DEPLOY_MARKER}"

#!/usr/bin/env bash
set -euo pipefail

echo "=========================================================="
echo "🚀 Bootstrapping Grokbot Browser VM on Prime Intellect"
echo "=========================================================="

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
    SUDO="sudo"
fi

# Check if docker is installed
if ! command -v docker &> /dev/null; then
    echo "📦 Installing Docker and Docker Compose..."
    curl -fsSL https://get.docker.com | $SUDO sh
    $SUDO systemctl enable docker
    $SUDO systemctl start docker
    if [ -n "$SUDO" ]; then
        $SUDO usermod -aG docker "$USER" || true
    fi
fi

# Ensure compose plugin is installed
if ! $SUDO docker compose version &> /dev/null; then
    $SUDO apt-get update && $SUDO apt-get install -y docker-compose-plugin
fi

# Create persistent data directories on host
echo "📁 Initializing persistent storage directories at /data..."
$SUDO mkdir -p /data/chrome-profile /data/downloads
$SUDO chmod -R 777 /data/chrome-profile /data/downloads

# Build and start container
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🔨 Building and launching the Browser VM container..."
$SUDO docker compose build
$SUDO docker compose up -d

PUBLIC_IP=$(curl -s ifconfig.me || curl -s icanhazip.com || echo "89.169.114.125")

echo ""
echo "=========================================================="
echo "✅ Browser VM is Live and Running!"
echo "=========================================================="
echo "🖥️  Live Web UI (Human view): http://${PUBLIC_IP}:6080/vnc.html"
echo "🤖 CDP Endpoint (Agent):       ws://${PUBLIC_IP}:9222"
echo "📁 Persistent Profile:        /data/chrome-profile"
echo ""
echo "In Grokbot / Coolify, configure:"
echo "  BROWSER_VM_URL=http://${PUBLIC_IP}:6080/vnc.html"
echo "  BROWSER_CDP_URL=ws://${PUBLIC_IP}:9222"
echo "=========================================================="

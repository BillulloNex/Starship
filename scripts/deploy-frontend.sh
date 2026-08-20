#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════════════════════
# GrokBot Instant Frontend Deploy (~3 seconds)
#
# Builds the frontend locally and deploys the static build directly to
# Cloudflare Pages globally.
# ═══════════════════════════════════════════════════════════════════════════════

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "⚡ [1/2] Building frontend..."
npm --prefix OpenHands run build

echo "🚀 [2/2] Deploying to Cloudflare Pages (grokbot)..."
npx wrangler pages deploy OpenHands/build --project-name=grokbot --commit-dirty=true

echo "✅ Live globally in seconds!"

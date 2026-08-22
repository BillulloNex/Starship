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

# Export client-side observability & telemetry public keys for Vite static build
export VITE_POSTHOG_AI_ENABLED="${VITE_POSTHOG_AI_ENABLED:-true}"
export VITE_TELEMETRY_AUTO_CONSENT="${VITE_TELEMETRY_AUTO_CONSENT:-true}"
export VITE_POSTHOG_API_KEY="${VITE_POSTHOG_API_KEY:-phc_uAcMi6kFo9gVGsUTtTxSRHQuspXojDphT9ZkcsbhSQt9}"
export VITE_POSTHOG_HOST="${VITE_POSTHOG_HOST:-https://us.i.posthog.com}"
export VITE_LANGFUSE_PUBLIC_KEY="${VITE_LANGFUSE_PUBLIC_KEY:-pk-lf-544aeabf-e6ae-402e-b1f2-c876b355c34f}"
export VITE_LANGFUSE_BASE_URL="${VITE_LANGFUSE_BASE_URL:-https://hipaa.cloud.langfuse.com}"
export VITE_DD_APPLICATION_ID="${VITE_DD_APPLICATION_ID:-0d5c0440-1b43-481b-acf8-0fbbd4f9a44b}"
export VITE_DD_CLIENT_TOKEN="${VITE_DD_CLIENT_TOKEN:-pub9a571a74b58240aa46b3e5dc569e3db4}"
export VITE_DD_SITE="${VITE_DD_SITE:-us5.datadoghq.com}"
export VITE_LANGWATCH_API_KEY="${VITE_LANGWATCH_API_KEY:-sk-lw-Wvsoy6ulq3QYtMFH_O5X2dD2Z1XVtMNDsHNBQw5DvYqxMmgSUmuQXhw7w9gMYnf9t}"
export VITE_LANGWATCH_BASE_URL="${VITE_LANGWATCH_BASE_URL:-https://app.langwatch.ai}"
export VITE_OPIK_API_KEY="${VITE_OPIK_API_KEY:-BQr4JlCiiNlMR8x3raGyTDUtn}"
export VITE_RAINDROP_WRITE_KEY="${VITE_RAINDROP_WRITE_KEY:-35699173-1136-4b61-b748-02e3722ccebe}"

echo "⚡ [1/2] Building frontend..."
npm --prefix OpenHands run build


echo "🚀 [2/2] Deploying to Cloudflare Pages (grokbot)..."
npx wrangler pages deploy OpenHands/build --project-name=grokbot --commit-dirty=true

echo "✅ Live globally in seconds!"

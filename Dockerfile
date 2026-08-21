# syntax=docker/dockerfile:1.7

# ═══════════════════════════════════════════════════════════════════════════════
# GrokBot — Self-hosted OpenHands Agent Canvas
#
# Proper multi-stage build that combines three services:
#   1. Agent Server  — from ghcr.io/openhands/agent-server (upstream SDK image)
#   2. Automation    — installed via pip from openhands-automation
#   3. Frontend      — agent-canvas static build served by Node.js
#
# The entrypoint starts all three services and an ingress proxy that unifies
# them behind a single port (default 8000):
#   /api/automation/*  → automation backend (:18001)
#   /api/*, /sockets   → agent server (:18000)
#   /* (default)       → static frontend + SPA fallback
# ═══════════════════════════════════════════════════════════════════════════════

# ── Stage 1: Build frontend ──────────────────────────────────────────────────
FROM node:24-slim AS frontend-build

WORKDIR /build

# Cache-friendly: package files first
COPY OpenHands/package.json OpenHands/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# Copy VERSION to guarantee every version bump invalidates Docker layer cache
COPY VERSION ./VERSION

# Copy everything needed for the build
COPY OpenHands/ .

# Build the static frontend.
# VITE_BASE_PATH="/" so the app serves at grok.beenex.org/ (not /canvas)
ARG VITE_BASE_PATH="/"
ENV VITE_BASE_PATH=${VITE_BASE_PATH}

# Optional Langfuse keys for the browser-side SDK, supplied as Coolify "Build
# Variables". Never committed to the repo; when absent, browser tracing is
# disabled and only the server-side OTEL path (runtime env) reports traces.
ARG VITE_LANGFUSE_PUBLIC_KEY=""
ARG VITE_LANGFUSE_SECRET_KEY=""
ARG VITE_LANGFUSE_BASE_URL=""
ENV VITE_LANGFUSE_PUBLIC_KEY=${VITE_LANGFUSE_PUBLIC_KEY} \
    VITE_LANGFUSE_SECRET_KEY=${VITE_LANGFUSE_SECRET_KEY} \
    VITE_LANGFUSE_BASE_URL=${VITE_LANGFUSE_BASE_URL}

# Datadog RUM — browser-side client token and app ID, supplied as Coolify
# "Build Variables". When absent, the Datadog browser SDK is not initialised.
ARG VITE_DD_APPLICATION_ID=""
ARG VITE_DD_CLIENT_TOKEN=""
ARG VITE_DD_SITE=""
ARG VITE_DD_ENV=""
ENV VITE_DD_APPLICATION_ID=${VITE_DD_APPLICATION_ID} \
    VITE_DD_CLIENT_TOKEN=${VITE_DD_CLIENT_TOKEN} \
    VITE_DD_SITE=${VITE_DD_SITE} \
    VITE_DD_ENV=${VITE_DD_ENV}

# PostHog — project API key, ingestion host, and AI feature flag
ARG VITE_POSTHOG_API_KEY=""
ARG VITE_POSTHOG_HOST=""
ARG VITE_POSTHOG_AI_ENABLED=""
ENV VITE_POSTHOG_API_KEY=${VITE_POSTHOG_API_KEY} \
    VITE_POSTHOG_HOST=${VITE_POSTHOG_HOST} \
    VITE_POSTHOG_AI_ENABLED=${VITE_POSTHOG_AI_ENABLED}

# Telemetry auto-consent — when "true", pre-grants telemetry consent in
# localStorage so PostHog AI and other backends work without a consent banner.
ARG VITE_TELEMETRY_AUTO_CONSENT=""
ENV VITE_TELEMETRY_AUTO_CONSENT=${VITE_TELEMETRY_AUTO_CONSENT}

# Comet Opik — REST API key and optional workspace/base URL
ARG VITE_OPIK_API_KEY=""
ARG VITE_OPIK_BASE_URL=""
ARG VITE_OPIK_WORKSPACE=""
ENV VITE_OPIK_API_KEY=${VITE_OPIK_API_KEY} \
    VITE_OPIK_BASE_URL=${VITE_OPIK_BASE_URL} \
    VITE_OPIK_WORKSPACE=${VITE_OPIK_WORKSPACE}

# Langwatch — collector API key and optional base URL
ARG VITE_LANGWATCH_API_KEY=""
ARG VITE_LANGWATCH_BASE_URL=""
ENV VITE_LANGWATCH_API_KEY=${VITE_LANGWATCH_API_KEY} \
    VITE_LANGWATCH_BASE_URL=${VITE_LANGWATCH_BASE_URL}

# Write a .env file from the ARG values so Vite picks them up at build time.
# This avoids committing secrets to the repo — values come from Coolify build vars.
RUN printf '%s\n' \
      "VITE_POSTHOG_API_KEY=${VITE_POSTHOG_API_KEY}" \
      "VITE_POSTHOG_HOST=${VITE_POSTHOG_HOST}" \
      "VITE_POSTHOG_AI_ENABLED=${VITE_POSTHOG_AI_ENABLED}" \
      "VITE_OPIK_API_KEY=${VITE_OPIK_API_KEY}" \
      "VITE_OPIK_BASE_URL=${VITE_OPIK_BASE_URL}" \
      "VITE_OPIK_WORKSPACE=${VITE_OPIK_WORKSPACE}" \
      "VITE_LANGWATCH_API_KEY=${VITE_LANGWATCH_API_KEY}" \
      "VITE_LANGWATCH_BASE_URL=${VITE_LANGWATCH_BASE_URL}" \
      "VITE_LANGFUSE_PUBLIC_KEY=${VITE_LANGFUSE_PUBLIC_KEY}" \
      "VITE_LANGFUSE_SECRET_KEY=${VITE_LANGFUSE_SECRET_KEY}" \
      "VITE_LANGFUSE_BASE_URL=${VITE_LANGFUSE_BASE_URL}" \
      "VITE_DD_APPLICATION_ID=${VITE_DD_APPLICATION_ID}" \
      "VITE_DD_CLIENT_TOKEN=${VITE_DD_CLIENT_TOKEN}" \
      "VITE_DD_SITE=${VITE_DD_SITE}" \
      "VITE_DD_ENV=${VITE_DD_ENV}" \
      "VITE_TELEMETRY_AUTO_CONSENT=${VITE_TELEMETRY_AUTO_CONSENT}" \
      > .env \
    && rm -rf build && npm run build

# ── Stage 1b: Generate shell-sourceable defaults from config/defaults.json ──
# This avoids needing jq/python at container runtime to parse the JSON.
FROM node:24-slim AS config-gen
COPY OpenHands/config/defaults.json /tmp/
RUN node -e " \
  const c = JSON.parse(require('fs').readFileSync('/tmp/defaults.json','utf-8')); \
  const lines = [ \
    'CONFIG_AGENT_SERVER_PORT=' + c.ports.agentServer, \
    'CONFIG_AUTOMATION_PORT=' + c.ports.automation, \
    'CONFIG_PROXY_PORT=' + c.ports.proxy, \
    'CONFIG_STATE_SUBDIR=' + c.paths.stateSubdir, \
    'CONFIG_CONVERSATIONS=' + c.paths.conversations, \
    'CONFIG_BASH_EVENTS=' + c.paths.bashEvents, \
    'CONFIG_AUTOMATION_DB=' + c.paths.automationDb, \
    'CONFIG_CANVAS_BASE_PATH=' + c.paths.canvasBasePath, \
    'CONFIG_POSTHOG_API_KEY=' + c.telemetry.posthogApiKey, \
    'CONFIG_POSTHOG_HOST=' + c.telemetry.posthogHost, \
    'CONFIG_LANGFUSE_PUBLIC_KEY=' + (c.telemetry.langfusePublicKey || ''), \
    'CONFIG_LANGFUSE_SECRET_KEY=' + (c.telemetry.langfuseSecretKey || ''), \
    'CONFIG_LANGFUSE_HOST=' + (c.telemetry.langfuseHost || ''), \
    'CONFIG_DD_ENABLED=' + (c.telemetry.datadogEnabled || false), \
  ]; \
  require('fs').writeFileSync('/tmp/defaults.env', lines.join('\n') + '\n'); \
"

# ── Stage 2: Combined image ──────────────────────────────────────────────────
FROM ghcr.io/openhands/agent-server:1.40.1-python AS final

ARG VITE_BASE_PATH="/"

LABEL org.opencontainers.image.title="grokbot"
LABEL org.opencontainers.image.description="GrokBot — Self-hosted OpenHands Agent Canvas"

ENV AGENT_CANVAS_BASE_PATH=${VITE_BASE_PATH}

USER root

# The frontend already supports stdio MCP servers, but JavaScript-based servers
# need node/npm/npx in the production image so the agent-server can spawn them.
# Reuse the pinned Node build stage instead of installing from an external APT
# repository or relying on the agent-server base image to provide Node.js.
COPY --from=frontend-build /usr/local/bin/node /usr/local/bin/node
COPY --from=frontend-build /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
RUN ln -sf /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm && \
    ln -sf /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx && \
    node --version && npm --version && npx --version

# Install system deps required by automation's transitive dependencies
# (asyncpg needs libpq, which the agent-server base image may not include).
RUN if command -v apt-get >/dev/null 2>&1; then \
      apt-get update && \
      apt-get install -y --no-install-recommends libpq-dev curl && \
      rm -rf /var/lib/apt/lists/*; \
    fi

# Install automation server via pip (version pinned from config/defaults.json).
RUN --mount=type=cache,target=/root/.cache/pip \
    --mount=type=cache,target=/root/.cache/uv \
    uv pip install --system "openhands-automation==1.6.0" 2>/dev/null \
    || pip install --no-cache-dir "openhands-automation==1.6.0"

# ── Observability (Datadog APM + Langfuse HTTP OTLP) ───────────────────────────
RUN --mount=type=cache,target=/root/.cache/pip \
    --mount=type=cache,target=/root/.cache/uv \
    uv pip install --system "ddtrace" "opentelemetry-exporter-otlp-proto-http" 2>/dev/null \
    || pip install --no-cache-dir "ddtrace" "opentelemetry-exporter-otlp-proto-http"; \
    if [ -d /agent-server/.venv ]; then \
      /agent-server/.venv/bin/pip install --no-cache-dir "ddtrace" "opentelemetry-exporter-otlp-proto-http" 2>/dev/null || true; \
    fi; \
    if [ -d /openhands/.venv ]; then \
      /openhands/.venv/bin/pip install --no-cache-dir "ddtrace" "opentelemetry-exporter-otlp-proto-http" 2>/dev/null || true; \
    fi

# Pre-create persistence directories with correct ownership so the
# openhands user can write to them even when Docker creates anonymous
# volumes (which default to root).
RUN mkdir -p /home/openhands/.openhands/agent-canvas/conversations \
             /home/openhands/.openhands/agent-canvas/bash_events \
             /home/openhands/.openhands/automation \
             /home/openhands/.claude \
             /home/openhands/.codex \
             /projects && \
    chown -R openhands:openhands /home/openhands/.openhands /home/openhands/.claude /home/openhands/.codex /projects

# Copy the frontend build output.
COPY --from=frontend-build /build/build /opt/agent-canvas/frontend

# Copy the static-server scripts and their production runtime deps.
COPY OpenHands/scripts/static-server.mjs /opt/agent-canvas/static-server.mjs
COPY OpenHands/scripts/proxy-utils.mjs /opt/agent-canvas/proxy-utils.mjs
COPY OpenHands/scripts/datadog-proxy.mjs /opt/agent-canvas/datadog-proxy.mjs
COPY OpenHands/scripts/posthog-proxy.mjs /opt/agent-canvas/posthog-proxy.mjs
COPY OpenHands/scripts/codex-usage-proxy.mjs /opt/agent-canvas/codex-usage-proxy.mjs
COPY OpenHands/scripts/claude-usage-proxy.mjs /opt/agent-canvas/claude-usage-proxy.mjs
COPY OpenHands/scripts/telegram-bridge.mjs /opt/agent-canvas/telegram-bridge.mjs
COPY OpenHands/scripts/preview-proxy.mjs /opt/agent-canvas/preview-proxy.mjs
COPY OpenHands/scripts/app-registry.mjs /opt/agent-canvas/app-registry.mjs
COPY OpenHands/scripts/grokbot-app.mjs /opt/agent-canvas/grokbot-app.mjs
RUN chmod +x /opt/agent-canvas/grokbot-app.mjs && ln -sf /opt/agent-canvas/grokbot-app.mjs /usr/local/bin/grokbot-app
COPY OpenHands/scripts/grokbot-deploy.mjs /opt/agent-canvas/grokbot-deploy.mjs
RUN chmod +x /opt/agent-canvas/grokbot-deploy.mjs && ln -sf /opt/agent-canvas/grokbot-deploy.mjs /usr/local/bin/grokbot-deploy
COPY --from=frontend-build /build/node_modules/httpxy /opt/agent-canvas/node_modules/httpxy
COPY --from=frontend-build /build/node_modules/sirv /opt/agent-canvas/node_modules/sirv
COPY --from=frontend-build /build/node_modules/@polka /opt/agent-canvas/node_modules/@polka
COPY --from=frontend-build /build/node_modules/mrmime /opt/agent-canvas/node_modules/mrmime
COPY --from=frontend-build /build/node_modules/totalist /opt/agent-canvas/node_modules/totalist

# Copy the runtime-services-info builder (entrypoint.sh runs it as a CLI to
# emit the agent's <RUNTIME_SERVICES> block).
COPY OpenHands/scripts/runtime-services-info.mjs /opt/agent-canvas/runtime-services-info.mjs

# Persisted conversations created before the client_tools migration still
# import canvas_ui_tool by qualname. Keep the compatibility module available.
COPY OpenHands/tools/ /opt/agent-canvas/tools/

# Copy generated defaults.env (from config/defaults.json via config-gen stage)
COPY --from=config-gen /tmp/defaults.env /opt/agent-canvas/defaults.env

# Copy the VERSION file for Datadog service tagging
COPY VERSION /opt/agent-canvas/VERSION

# Copy the entrypoint
COPY OpenHands/docker/entrypoint.sh /opt/agent-canvas/entrypoint.sh
RUN chmod +x /opt/agent-canvas/entrypoint.sh

# Copy the wrapper entrypoint (fixes volume ownership before starting services)
COPY wrapper-entrypoint.sh /opt/agent-canvas/wrapper-entrypoint.sh
RUN chmod +x /opt/agent-canvas/wrapper-entrypoint.sh

# Stay as root — the wrapper entrypoint drops to openhands after fixing
# file ownership on mounted volumes. This is needed because the old
# container ran as root, so persisted files have root:root ownership.
# USER openhands

# Persistence volumes:
#   /home/openhands/.openhands — settings, secrets, conversations, automation DB
#   /projects                  — user code the agent can read/edit
VOLUME ["/home/openhands/.openhands", "/projects"]

# The entrypoint starts all services and the ingress proxy.
# Port 8000 is the unified entry point.
EXPOSE 8000

# Docker-level health check so Coolify (and Docker itself) can detect failures.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -sf http://localhost:8000/health || exit 1

# Wrapper fixes permissions, then execs the real entrypoint as openhands
ENTRYPOINT ["tini", "--", "/opt/agent-canvas/wrapper-entrypoint.sh"]

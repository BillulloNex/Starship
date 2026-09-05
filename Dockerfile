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

# Patch Browser MCP catalog entry to use persistent chrome-profile directory.
# Without this, @browsermcp/mcp uses a temp profile that dies with the container.
RUN node -e " \
  const fs = require('fs'); \
  const p = 'node_modules/@openhands/extensions/integrations/catalog/browser-mcp.json'; \
  if (fs.existsSync(p)) { \
    const j = JSON.parse(fs.readFileSync(p, 'utf-8')); \
    const conn = j.connectionOptions?.[0]; \
    if (conn?.transport?.args) { \
      conn.transport.args.push('--user-data-dir', '/home/openhands/.openhands/chrome-profile'); \
    } \
    fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\\n'); \
    console.log('Patched browser-mcp.json with persistent --user-data-dir'); \
  } else { \
    console.log('browser-mcp.json not found, skipping patch'); \
  } \
"

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

# Raindrop — write key and optional project slug / base URL
ARG VITE_RAINDROP_WRITE_KEY=""
ARG VITE_RAINDROP_PROJECT_ID=""
ARG VITE_RAINDROP_BASE_URL=""
ENV VITE_RAINDROP_WRITE_KEY=${VITE_RAINDROP_WRITE_KEY} \
    VITE_RAINDROP_PROJECT_ID=${VITE_RAINDROP_PROJECT_ID} \
    VITE_RAINDROP_BASE_URL=${VITE_RAINDROP_BASE_URL}

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
      "VITE_RAINDROP_WRITE_KEY=${VITE_RAINDROP_WRITE_KEY}" \
      "VITE_RAINDROP_PROJECT_ID=${VITE_RAINDROP_PROJECT_ID}" \
      "VITE_RAINDROP_BASE_URL=${VITE_RAINDROP_BASE_URL}" \
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
COPY --from=frontend-build /usr/local /usr/local
RUN node --version && npm --version && npx --version

# Install system deps required by automation and headless Chromium
ENV CHROME_PATH=/usr/bin/chromium \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    BROWSER_CHROMIUM_PERSISTENT_CONTEXT_DIR=/home/openhands/.openhands/chrome-profile \
    BROWSER_USER_DATA_DIR=/home/openhands/.openhands/chrome-profile

RUN if command -v apt-get >/dev/null 2>&1; then \
      apt-get update && \
      apt-get install -y --no-install-recommends libpq-dev curl chromium xvfb x11vnc fluxbox xdotool python3-websockify novnc dbus-x11 gnome-keyring libsecret-1-0 libsecret-tools python3-secretstorage unzip && \
      ln -sf /usr/share/novnc /opt/novnc && \
      rm -rf /var/lib/apt/lists/*; \
    fi

# Install automation server via pip (version pinned from config/defaults.json).
# Pin fastmcp<4.0.0: fastmcp 4.0.0 (2026-08-31) requires mcp>=2.0 which
# reorganised internal modules (mcp.shared.session removed), breaking the
# openhands-sdk import chain.  openhands-sdk==1.40.1 specifies fastmcp>=3.0.0
# (unbounded upper), so without this pin pip resolves to 4.0.0 and the
# automation uvicorn process crashes on startup with ModuleNotFoundError.
RUN --mount=type=cache,target=/root/.cache/pip \
    --mount=type=cache,target=/root/.cache/uv \
    uv pip install --system "openhands-automation==1.6.0" "fastmcp>=3.0.0,<4.0.0" 2>/dev/null \
    || pip install --no-cache-dir "openhands-automation==1.6.0" "fastmcp>=3.0.0,<4.0.0"

# Guard: telemetry failures must not abort watchdog cleanup (incident 2026-08-30)
COPY patches/guard-watchdog-telemetry.py /tmp/guard-watchdog-telemetry.py
RUN python3 /tmp/guard-watchdog-telemetry.py && rm /tmp/guard-watchdog-telemetry.py

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

# Install Bun and Antigravity CLI (agy)
COPY --from=oven/bun:1 /usr/local/bin/bun /usr/local/bin/bun
RUN bun --version && \
    curl -fsSL https://antigravity.google/cli/install.sh | bash -s -- --dir /usr/local/bin && \
    chmod +x /usr/local/bin/agy && \
    /usr/local/bin/agy --version || true

# Install the official Cursor Agent CLI for the Cursor ACP provider. Keep the
# release explicit so production rebuilds do not silently pick up a different
# agent binary. Cursor publishes x64/arm64 Linux bundles under the same release
# identifier; install the complete bundle because the launcher has adjacent
# runtime assets, then expose both current and legacy CLI names on PATH.
ARG CURSOR_AGENT_VERSION="2026.08.25-3e8eec8"
# Containers do not have a durable desktop keychain. Cursor's supported file
# credential store writes auth to ~/.cursor/auth.json, which production mounts.
ENV AGENT_CLI_CREDENTIAL_STORE=file
RUN set -eux; \
    case "$(uname -m)" in \
      x86_64|amd64) cursor_agent_arch="x64" ;; \
      arm64|aarch64) cursor_agent_arch="arm64" ;; \
      *) echo "Unsupported Cursor Agent architecture: $(uname -m)" >&2; exit 1 ;; \
    esac; \
    cursor_agent_dir="/opt/cursor-agent/${CURSOR_AGENT_VERSION}"; \
    mkdir -p "${cursor_agent_dir}"; \
    curl -fsSL "https://downloads.cursor.com/lab/${CURSOR_AGENT_VERSION}/linux/${cursor_agent_arch}/agent-cli-package.tar.gz" \
      | tar --strip-components=1 -xzf - -C "${cursor_agent_dir}"; \
    ln -s "${cursor_agent_dir}/cursor-agent" /usr/local/bin/agent; \
    ln -s "${cursor_agent_dir}/cursor-agent" /usr/local/bin/cursor-agent; \
    agent --version

# Install official OpenCode CLI for the OpenCode ACP provider
ARG OPENCODE_VERSION="1.18.29"
RUN curl -fsSL https://opencode.ai/install | bash -s -- --version "${OPENCODE_VERSION}" --no-modify-path && \
    install -m 755 /root/.opencode/bin/opencode /usr/local/bin/opencode && \
    rm -rf /root/.opencode && \
    opencode --version

# Pre-create persistence directories with correct ownership so the
# openhands user can write to them even when Docker creates anonymous
# volumes (which default to root).
RUN mkdir -p /home/openhands/.openhands/agent-canvas/conversations \
             /home/openhands/.openhands/agent-canvas/bash_events \
             /home/openhands/.openhands/automation \
             /home/openhands/.openhands/chrome-profile \
             /home/openhands/.openhands/antigravity/antigravity-acp \
             /home/openhands/.claude \
             /home/openhands/.codex \
             /home/openhands/.cursor \
             /home/openhands/.local/share/opencode \
             /home/openhands/.config/opencode \
             /home/openhands/.gemini \
             /home/openhands/.agy-acp \
             /tmp/vnc-browser/logs \
             /projects && \
    chown -R openhands:openhands /home/openhands /projects /tmp/vnc-browser

# Install official Google Antigravity ACP server (linux-x86_64)
ARG AGY_ACP_VERSION="agy_acp_server_20260818_01_RC01"
ARG AGY_ACP_SHA256="ce3f09628575b25497cf5a3c19d073b49acb80f1dab1ff8592919e9c9b8799e1"
RUN set -eux; \
    mkdir -p /opt/antigravity; \
    curl -fsSL "https://dl.google.com/agy-extensions/releases/linux/agy-acp-server-${AGY_ACP_VERSION}-linux-x86_64.zip" -o /tmp/agy-acp.zip; \
    echo "${AGY_ACP_SHA256}  /tmp/agy-acp.zip" | sha256sum -c -; \
    unzip -q /tmp/agy-acp.zip -d /opt/antigravity; \
    rm -f /tmp/agy-acp.zip; \
    chmod +x /opt/antigravity/agy_acp_server.par /opt/antigravity/localharness_external; \
    chown -R openhands:openhands /opt/antigravity

# Copy Antigravity ACP launcher and register agy-acp
COPY OpenHands/scripts/agy-acp-launcher.mjs /opt/agent-canvas/agy-acp-launcher.mjs
RUN chmod +x /opt/agent-canvas/agy-acp-launcher.mjs && \
    ln -sf /opt/agent-canvas/agy-acp-launcher.mjs /usr/local/bin/agy-acp

# Copy the frontend build output.
COPY --from=frontend-build /build/build /opt/agent-canvas/frontend


# Copy the static-server scripts and their production runtime deps.
COPY OpenHands/scripts/static-server.mjs /opt/agent-canvas/static-server.mjs
COPY OpenHands/scripts/proxy-utils.mjs /opt/agent-canvas/proxy-utils.mjs
COPY OpenHands/scripts/datadog-proxy.mjs /opt/agent-canvas/datadog-proxy.mjs
COPY OpenHands/scripts/posthog-proxy.mjs /opt/agent-canvas/posthog-proxy.mjs
COPY OpenHands/scripts/codex-usage-proxy.mjs /opt/agent-canvas/codex-usage-proxy.mjs
COPY OpenHands/scripts/claude-usage-proxy.mjs /opt/agent-canvas/claude-usage-proxy.mjs
COPY OpenHands/scripts/cursor-api-proxy.mjs /opt/agent-canvas/cursor-api-proxy.mjs
COPY OpenHands/scripts/opencode-api-proxy.mjs /opt/agent-canvas/opencode-api-proxy.mjs
COPY OpenHands/scripts/telegram-bridge.mjs /opt/agent-canvas/telegram-bridge.mjs
COPY OpenHands/scripts/preview-proxy.mjs /opt/agent-canvas/preview-proxy.mjs
COPY OpenHands/scripts/app-registry.mjs /opt/agent-canvas/app-registry.mjs
COPY OpenHands/scripts/grokbot-app.mjs /opt/agent-canvas/grokbot-app.mjs
RUN chmod +x /opt/agent-canvas/grokbot-app.mjs && ln -sf /opt/agent-canvas/grokbot-app.mjs /usr/local/bin/grokbot-app
COPY OpenHands/scripts/job-board.mjs /opt/agent-canvas/job-board.mjs
RUN chmod +x /opt/agent-canvas/job-board.mjs && ln -sf /opt/agent-canvas/job-board.mjs /usr/local/bin/grokbot-job
COPY OpenHands/scripts/grokbot-deploy.mjs /opt/agent-canvas/grokbot-deploy.mjs
RUN chmod +x /opt/agent-canvas/grokbot-deploy.mjs && ln -sf /opt/agent-canvas/grokbot-deploy.mjs /usr/local/bin/grokbot-deploy
COPY OpenHands/scripts/skill-installer.mjs /opt/agent-canvas/skill-installer.mjs
COPY scripts/start-vnc-browser.sh /opt/agent-canvas/start-vnc-browser.sh
COPY scripts/ship-jira-orchestrator.mjs /opt/agent-canvas/ship-jira-orchestrator.mjs
COPY scripts/ship-log-monitor-orchestrator.mjs /opt/agent-canvas/ship-log-monitor-orchestrator.mjs
COPY scripts/ship-coolify-logs.mjs /opt/agent-canvas/ship-coolify-logs.mjs
COPY scripts/ship-jira.py /opt/agent-canvas/ship-jira.py
COPY scripts/register-ship-log-monitor.mjs /opt/agent-canvas/register-ship-log-monitor.mjs
COPY scripts/ensure-ship-coolify-secret.mjs /opt/agent-canvas/ensure-ship-coolify-secret.mjs
COPY prompts/ship-log-monitor.md /opt/agent-canvas/prompts/ship-log-monitor.md
COPY scripts/cursor-acp-auth-wrapper.sh /opt/agent-canvas/cursor-acp-auth-wrapper.sh
COPY scripts/opencode-acp-auth-wrapper.sh /opt/agent-canvas/opencode-acp-auth-wrapper.sh
RUN chmod +x /opt/agent-canvas/start-vnc-browser.sh && ln -sf /opt/agent-canvas/start-vnc-browser.sh /usr/local/bin/start-vnc-browser && \
    chmod +x /opt/agent-canvas/cursor-acp-auth-wrapper.sh && ln -sf /opt/agent-canvas/cursor-acp-auth-wrapper.sh /usr/local/bin/cursor-acp && \
    chmod +x /opt/agent-canvas/opencode-acp-auth-wrapper.sh && ln -sf /opt/agent-canvas/opencode-acp-auth-wrapper.sh /usr/local/bin/opencode-acp
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
RUN chmod +x /opt/agent-canvas/wrapper-entrypoint.sh /opt/agent-canvas/cursor-acp-auth-wrapper.sh /opt/agent-canvas/opencode-acp-auth-wrapper.sh

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
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --start-interval=5s --retries=3 \
  CMD curl -sf http://localhost:8000/health || exit 1

# Wrapper fixes permissions, then execs the real entrypoint as openhands
ENTRYPOINT ["tini", "--", "/opt/agent-canvas/wrapper-entrypoint.sh"]

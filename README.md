# Grokbot

> **Hello from Dispatcher Automation!**

Grokbot is a self-hosted, 24/7 autonomous AI coding agent platform and developer control center built on top of OpenHands Agent Canvas. It allows AI coding agents to run continuously on dedicated bare-metal servers or cloud infrastructure with persistent storage, full CLI/ACP tool execution, and browser interaction capabilities.

---

## 🏛️ Codebase Architecture

Grokbot uses a split-deployment architecture combining a globally distributed static frontend with a containerized multi-service backend runtime:

```mermaid
graph TD
    Client[Browser / User] -->|HTTPS| CF[Cloudflare Pages: grok.beenex.org]
    Client -->|API / WebSockets| Ingress[Node.js Ingress Proxy :8000]
    subgraph Coolify Docker Container
        Ingress -->|/api/automation/*| AutoServer[OpenHands Automation :18001]
        Ingress -->|/api/*, /sockets| AgentServer[OpenHands Agent Server :18000]
        Ingress -->|Live Preview Hostnames| AppPreview[Preview Proxy: p{port}.beenex.org]
        AgentServer --> ACP[ACP Providers: Cursor, Antigravity, Claude, Codex]
        AgentServer --> MCP[MCP Servers & Browser VM / VNC]
    end
    Ingress -.-> Observability[Datadog / Langfuse / PostHog]
```

### 1. Frontend (`OpenHands/`)
- **Technology**: React 19, TypeScript, Vite, Tailwind CSS, React Router.
- **Hosting**: Deployed globally to **Cloudflare Pages** (`https://grok.beenex.org`) via `scripts/deploy-frontend.sh`.
- **Key Features**: Multi-agent chat canvas, ACP provider and model switcher, live diff viewer, task planning, MCP tool catalog, usage & quota meters (Cursor, Claude, Codex), and live application preview frames.

### 2. Backend & Agent Server (`Dockerfile`, `wrapper-entrypoint.sh`)
- **Technology**: Multi-stage Docker image based on `ghcr.io/openhands/agent-server:1.40.1-python` with `openhands-automation==1.6.0`.
- **Hosting**: Deployed via **Coolify** (`https://grok-api.beenex.org`) to dedicated infrastructure.
- **Ingress Proxy (`OpenHands/scripts/`)**: Node.js reverse proxy (`static-server.mjs`, `preview-proxy.mjs`, etc.) running on port `8000` that unifies agent server APIs (`:18000`), automation endpoints (`:18001`), telemetry relays, and SPA routing under a single endpoint.

### 3. External CLI & ACP Providers
- Native integration with the **Agent Client Protocol (ACP)** supporting:
  - **Cursor Agent** (`agent acp`)
  - **Antigravity CLI** (`agy` / `agy-acp`)
  - **Claude Code** and **Codex**
  - **Model Context Protocol (MCP)** stdio and SSE servers

### 4. Sandbox, Persistence & Browser Automation
- **Persistent Volumes**: Durable host mounts for user workspaces (`/projects`) and agent state / credentials / Chrome profiles (`/home/openhands/.openhands`).
- **Browser Automation**: Headless Chromium with VNC support (`scripts/start-vnc-browser.sh`, noVNC) with shared persistent session profiles across container redeployments.
- **Autonomous Ralph Loop**: Budget-controlled runner (`scripts/ralph-runner.mjs`) enabling unattended iterative multi-turn task execution.

### 5. Observability & Telemetry
- Unified tracing and monitoring via **Datadog APM & RUM**, **Langfuse** (OTEL proto-HTTP), **PostHog AI**, **Comet Opik**, and **Langwatch**.

---

## 🚀 Development & Deployment

### Versioning
Grokbot enforces strict semantic versioning. Whenever committing changes, bump the version:
```bash
node scripts/bump-version.mjs patch  # or minor / major
```

### Frontend Deployment
```bash
./scripts/deploy-frontend.sh
```

### Backend Deployment
Pushing to `main` automatically triggers deployment in Coolify.

---

## 📄 License
This project is licensed under the MIT License. See [LICENSE](OpenHands/LICENSE) for details.

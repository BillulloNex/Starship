# Datadog Observability Setup

Grokbot uses Datadog for full-stack observability: APM, Log Management, LLM Observability, Real User Monitoring (RUM), Application Security, and Infrastructure Monitoring.

This runs **alongside** the existing Langfuse LLM tracing — both systems operate independently.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Browser                          │
│  ┌──────────────────────────────────────────────┐   │
│  │ React App (RUM SDK + Browser Logs SDK)       │   │
│  │  → Session Replay, Core Web Vitals, JS Errors│   │
│  └──────────────────┬───────────────────────────┘   │
│                     │ HTTPS                         │
└─────────────────────┼───────────────────────────────┘
                      ▼
┌─────────────────────────────────────────────────────┐
│              Docker Host (Coolify)                   │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │ GrokBot Container (port 8000)                │   │
│  │  ├─ Node.js Proxy (sirv + httpxy)            │   │
│  │  ├─ Agent Server (:18000) ← ddtrace-run      │   │
│  │  │   └─ LiteLLM → LLM providers             │   │
│  │  └─ Automation Server (:18001) ← ddtrace-run │   │
│  └──────────────────┬───────────────────────────┘   │
│                     │ traces, logs, metrics          │
│  ┌──────────────────▼───────────────────────────┐   │
│  │ Datadog Agent Sidecar (:8126 APM, :8125 DSD) │   │
│  │  → Forwards to Datadog intake                │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

## Required Environment Variables

Set these in **Coolify** as environment variables on the GrokBot service:

### Backend (Runtime Variables)

| Variable | Required | Description |
|:---------|:--------:|:------------|
| `DD_API_KEY` | ✅ | Datadog API key. Enables all backend tracing and telemetry ingestion. |
| `DD_APP_KEY` | ❌ | Datadog Application Key. Enables the built-in Observability dashboard (`/settings/observability`). |
| `DD_SITE` | ❌ | Datadog site (default: `datadoghq.com` or `us5.datadoghq.com`) |
| `DD_ENV` | ❌ | Environment tag (default: `production`) |
| `DD_AGENT_HOST` | ❌ | Datadog Agent hostname (default: `127.0.0.1`) |
| `DD_TRACE_ENABLED` | ❌ | Enable/disable APM (default: `true` when DD_API_KEY set) |
| `DD_APPSEC_ENABLED` | ❌ | Enable/disable ASM (default: `true` when DD_API_KEY set) |
| `DD_LLMOBS_ENABLED` | ❌ | Enable/disable LLM Observability (default: `true`) |
| `DD_LLMOBS_ML_APP` | ❌ | LLM Obs app name (default: `grokbot`) |
| `DD_LOGS_INJECTION` | ❌ | Correlate logs with traces (default: `true`) |

### Frontend (Build Variables)

| Variable | Required | Description |
|:---------|:--------:|:------------|
| `VITE_DD_APPLICATION_ID` | ✅ | RUM Application ID (from Datadog RUM setup) |
| `VITE_DD_CLIENT_TOKEN` | ✅ | Client Token (from Datadog) |
| `VITE_DD_SITE` | ❌ | Datadog site (default: `datadoghq.com`) |
| `VITE_DD_ENV` | ❌ | Environment tag (default: `production`) |
| `VITE_DD_SESSION_SAMPLE_RATE` | ❌ | RUM sample rate 0-100 (default: `100`) |
| `VITE_DD_SESSION_REPLAY_SAMPLE_RATE` | ❌ | Session Replay rate 0-100 (default: `20`) |

### CI/CD (GitHub Secrets)

| Secret | Required | Description |
|:-------|:--------:|:------------|
| `DD_API_KEY` | ❌ | Enables deployment tracking in Datadog |

## Datadog Agent Sidecar

Deploy the Datadog Agent as a sidecar container using the provided compose file:

```bash
# From the repo root
docker compose -f docker-compose.datadog.yml up -d
```

Or deploy it as a separate service in Coolify pointing to `docker-compose.datadog.yml`.

## What Gets Monitored

### APM (Automatic)
- All HTTP requests to Agent Server and Automation Server
- WebSocket connections and message handling
- SQLite database queries
- LLM API calls via LiteLLM (latency, tokens, cost)
- Cross-service trace correlation

### LLM Observability
- Every LLM completion call (model, provider, tokens, latency, cost)
- Agent reasoning chains and tool calls
- Streaming response metrics (time-to-first-token)
- Hallucination detection and prompt injection monitoring

### RUM (Frontend)
- Core Web Vitals (LCP, FID, CLS)
- User session recording (20% sample rate by default)
- JavaScript errors and console errors
- WebSocket connection events
- Resource loading performance
- User interaction tracking

### Application Security
- OWASP Top 10 attack detection
- IP reputation blocking
- Known CVE detection in dependencies
- Prompt injection detection

### Infrastructure
- Docker container CPU, memory, disk
- Process health (3 internal services)
- Container restart events

## Built-in Observability Dashboard

Grokbot includes a native observability dashboard under **Settings → Observability** (`/settings/observability`).

Features:
- **Service Health Cards**: Status and port inspection for Agent Server, Automation, Frontend, and Datadog Sidecar.
- **APM Performance**: Live Requests/sec, p50 and p95 latency percentiles with SVG trend sparklines, error rates, and CPU load.
- **LLM Observability**: Generative AI tracing, prompt/completion/reasoning token stats, and security guards.
- **Live Logs Stream**: Real-time error and warning logs with search filtering and detailed JSON inspection.
- **Monitors & Alerting**: Live alert states (OK, Warning, Alert, No Data) with direct Datadog deep links.

Requires `DD_API_KEY` and `DD_APP_KEY` set as runtime environment variables in Coolify.

## Jira Integration for Alerts

Alerts are configured to auto-create Jira tickets. Set up the Jira integration in Datadog:

1. Go to **Integrations → Jira** in Datadog
2. Connect your Jira instance
3. Configure the default project and issue type
4. Monitors will auto-create tickets on alert

## Disabling Datadog

To disable Datadog completely:
- **Backend**: Remove the `DD_API_KEY` environment variable from Coolify
- **Frontend**: Remove the `VITE_DD_APPLICATION_ID` and `VITE_DD_CLIENT_TOKEN` build variables
- **Agent**: Stop the datadog-agent sidecar container

All Datadog code paths are gated behind these environment variables — no code changes needed.

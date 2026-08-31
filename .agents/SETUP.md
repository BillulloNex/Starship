# Agent Environment Setup & Secrets Reference

This guide explains how any AI agent (Claude Code, Cursor, Antigravity, OpenHands, CLI runners) synchronizes all production credentials from **Coolify** (`grokbot`, UUID: `b13aardv73k5fyl01a80ggzc`).

---

## ⚡ 1-Step Setup

```bash
export COOLIFY_API_TOKEN="<your-coolify-api-token>"
node scripts/pull-coolify-env.mjs
```

This pulls all production secrets into `.env.local` (git-ignored).

---

## 🔑 Secret Inventory (Stored in Coolify)

| Subsystem | Variables Managed in Coolify |
| :--- | :--- |
| **Datadog Observability** | `DD_API_KEY`, `DD_APP_KEY`, `DD_SITE`, `VITE_DD_APPLICATION_ID`, `VITE_DD_CLIENT_TOKEN`, `DD_LLMOBS_ENABLED`, `DD_LLMOBS_ML_APP` |
| **Langfuse Tracing** | `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL`, `VITE_LANGFUSE_PUBLIC_KEY`, `VITE_LANGFUSE_SECRET_KEY`, `VITE_LANGFUSE_BASE_URL` |
| **PostHog Analytics** | `POSTHOG_API_KEY`, `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID`, `POSTHOG_HOST`, `VITE_POSTHOG_API_KEY`, `VITE_POSTHOG_HOST`, `VITE_POSTHOG_AI_ENABLED` |
| **Opik & Langwatch** | `VITE_OPIK_API_KEY`, `VITE_LANGWATCH_API_KEY`, `VITE_LANGWATCH_BASE_URL`, `RAINDROP_WRITE_KEY`, `VITE_RAINDROP_WRITE_KEY` |
| **Live Browser VM** | `VITE_BROWSER_VM_URL` (`https://surf.beenex.org`), `PREVIEW_HOST_PATTERN` |
| **Telegram Bridge** | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_USER_IDS` |
| **Server Internal Auth** | `LOCAL_BACKEND_API_KEY`, `GROKBOT_AGENT_SERVER_API_KEY`, `OPENHANDS_AUTOMATION_API_KEY`, `AGENT_CANVAS_BASE_PATH`, `AGENT_CLI_CREDENTIAL_STORE` |
| **Coolify References** | `COOLIFY_BASE_URL`, `COOLIFY_APP_UUID` |

---

## 🤖 Dynamic Execution (Without `.env.local`)

To run an agent with secrets injected dynamically in memory:

```bash
node scripts/pull-coolify-env.mjs --run -- <agent-command>
```

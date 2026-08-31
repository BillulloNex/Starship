---
name: setup-agent-env
description: >
  Single-source setup and secrets synchronization for all AI agents (Claude Code, Cursor, Antigravity, OpenHands, CLI).
  Pulls verified production credentials and environment configurations directly from Coolify into local .env.local and runtime configs.
  Use when the user or an agent says "setup environment", "pull secrets", "bootstrap agent", "configure mcps", or switches between AI agents.
---

# Agent Environment & Secrets Setup (Coolify Single Source of Truth)

This skill provides a zero-leak, automated setup process to configure any AI agent (Claude Code, Cursor, Antigravity, OpenHands, CLI runners) with all required production secrets and environment variables.

All credentials live securely in **Coolify** as the Single Source of Truth (`app: grokbot`, UUID: `b13aardv73k5fyl01a80ggzc`).

---

## 🚀 Quickstart (One Command Setup)

To bootstrap your local environment and populate `.env.local` with all verified secrets:

```bash
# 1. Ensure your Coolify API Token is exported in your shell
export COOLIFY_API_TOKEN="<your-coolify-api-token>"

# 2. Run the environment synchronizer
node scripts/pull-coolify-env.mjs
```

To run an agent command directly with secrets injected in memory (without saving to disk):

```bash
node scripts/pull-coolify-env.mjs --run -- cursor .
# or
node scripts/pull-coolify-env.mjs --run -- claude
```

---

## 🛠️ Automated Agent MCP Setup

When an agent needs to access the Coolify secrets on demand via MCP, use the **`coolify-mcp-server`**:

```json
{
  "name": "env_vars",
  "arguments": {
    "action": "list",
    "resource": "application",
    "uuid": "b13aardv73k5fyl01a80ggzc",
    "reveal": true
  }
}
```

---

## 📦 What Is Synchronized

Running this skill provisions full access to all 5 operational subsystems:

### 1. Observability, APM & Telemetry
- **Datadog**: `DD_API_KEY`, `DD_APP_KEY`, `DD_SITE` (`us5.datadoghq.com`), `VITE_DD_APPLICATION_ID`, `VITE_DD_CLIENT_TOKEN`, `DD_LLMOBS_ENABLED`
- **Langfuse**: `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL` (`https://hipaa.cloud.langfuse.com`)
- **PostHog**: `POSTHOG_API_KEY`, `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID` (`561056`), `POSTHOG_HOST` (`https://us.i.posthog.com`), `VITE_POSTHOG_AI_ENABLED`
- **Langwatch & Opik**: `VITE_LANGWATCH_API_KEY`, `VITE_LANGWATCH_BASE_URL`, `VITE_OPIK_API_KEY`, `VITE_RAINDROP_WRITE_KEY`

### 2. Live Browser Automation & Streaming
- **Steel.dev Browser**: `VITE_BROWSER_VM_URL` (`https://surf.beenex.org/v1/sessions/debug?interactive=true&showControls=true&theme=dark`)
- **Public App Previews**: `PREVIEW_HOST_PATTERN` (`{app}.beenex.space,p{port}.beenex.space,{app}.beenex.org,p{port}.beenex.org`)

### 3. Telegram Bridge & Remote Agent Channel
- `TELEGRAM_BOT_TOKEN`: `8822184580:AAHLGioEyrBVNvwt3_hD_O32bVdU6CoqiLI`
- `TELEGRAM_ALLOWED_USER_IDS`: `6544913948`

### 4. GrokBot Server Security
- `LOCAL_BACKEND_API_KEY`, `GROKBOT_AGENT_SERVER_API_KEY`, `OPENHANDS_AUTOMATION_API_KEY` (`S9Ni/L8opqCk7HgXyBfEwvd16oGixLf6Sg1lZKRtewg=`)
- `AGENT_CANVAS_BASE_PATH`: `/`
- `AGENT_CLI_CREDENTIAL_STORE`: `file`

### 5. Self-Reference Configuration
- `COOLIFY_BASE_URL`: `https://coolify.beenex.org`
- `COOLIFY_APP_UUID`: `b13aardv73k5fyl01a80ggzc`

---

## 🔒 Security Best Practices for Agents

1. **Never commit `.env.local` or secrets into git.** Git repositories only track templates and instructions.
2. **Rotate in Coolify:** If any key needs rotation, update it in Coolify; all agents will automatically receive the updated secret on their next pull.
3. **Verify Deployment:** After code changes, run `./scripts/deploy-frontend.sh` for frontend updates and push to `main` for backend updates, tracking Coolify deployment status until `finished`.

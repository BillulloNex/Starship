# SHIP Jira delivery automation

Starship polls Jira every two minutes without invoking an LLM. It serializes
eligible Bugs, Stories, Tasks, and Subtasks through these stages:

`To Do` → `In Progress` → `Deployed To Test` → `In Review / QA` → `Done`

Composer 2.5 performs evidence-based triage, Codex GPT-5.6 Sol implements and
pushes directly to `main`, and Cursor Grok 4.6 performs independent browser QA
against `https://ship.beenex.org`. Epics are ignored. Ambiguous work moves to
`Needs Clarification`; exhausted implementation attempts, deployment failures,
and QA failures move to `Needs Attention` with a Jira comment.

## Runtime configuration

Credentials are resolved from environment variables first, then from the
Agent Server encrypted secret store. Required secret names:

- `JIRA_URL`, `JIRA_USERNAME`, `JIRA_API_TOKEN`
- `GITHUB_PERSONAL_ACCESS_TOKEN`
- `SLACK_BOT_TOKEN`

Set `SHIP_SLACK_CHANNEL_ID` to the ID of `#starship`. Slack API calls require a
channel ID; a name is not sufficient. The bot must be invited to that channel.

Optional variables include `SHIP_JIRA_POLL_MS`, `SHIP_REPO_DIR`,
`SHIP_MAX_BUILD_ATTEMPTS`, `SHIP_CONVERSATION_TIMEOUT_MS`, and
`SHIP_DEPLOY_TIMEOUT_MS`.

State persists at `/home/openhands/.openhands/ship-automation/state.json`, so a
Coolify replacement caused by the builder's push can resume deployment tracking
and QA. Logs are written to `/home/openhands/.openhands/ship-automation.log`.

## Required agent profiles

- `SHIP-Triage`: Cursor ACP using `composer-2.5`.
- `SHIP-Builder`: Codex ACP using `gpt-5.6-sol`.
- `SHIP-QA`: Cursor ACP using `grok-4.6[effort=high,fast=false]`.

The orchestrator refuses to claim work until all three profiles exist.
Cursor profiles use `/opt/agent-canvas/cursor-acp-auth-wrapper.sh` so the ACP
subprocess receives the stored `CURSOR_API_KEY` without logging or copying it.

## SHIP Log Monitor (Coolify → Jira)

Daily scan of Coolify container logs for `https://ship.beenex.org`. Cursor
Composer 2.5 (`fast=false`) triages errors from the last 24 hours and files new
**Bug** tickets in project **SHIP** with status **To Do** for the delivery
orchestrator above to pick up.

### How it runs (primary)

The background orchestrator starts with the container and runs daily at
**06:00 America/New_York**:

```bash
node scripts/ship-log-monitor-orchestrator.mjs
```

One-shot test: `node scripts/ship-log-monitor-orchestrator.mjs --once`

Logs: `/home/openhands/.openhands/ship-log-monitor.log`  
State: `/home/openhands/.openhands/ship-automation/log-monitor-state.json`

### Required agent profile

Create **`SHIP-LogMonitor`**: Cursor ACP using `composer-2.5[fast=false]`.
Same auth wrapper as other SHIP Cursor profiles (`cursor-acp-auth-wrapper.sh`).

The orchestrator refuses to run until this profile exists.

### Optional cron automation (UI)

For visibility in Starship Automations, register a disabled cron twin:

```bash
node scripts/register-ship-log-monitor.mjs
```

Keep it **disabled** while the ACP orchestrator is active to avoid duplicate
Jira tickets. Enable only if you disable the orchestrator.

### Coolify credentials

Store in Coolify runtime env (or agent secrets):

- `COOLIFY_API_TOKEN` (or `COOLIFY_ACCESS_TOKEN`)
- `COOLIFY_BASE_URL` (default `https://coolify.beenex.org`)
- `COOLIFY_APP_UUID` (default `b13aardv73k5fyl01a80ggzc` — Starship/grokbot app)

### Jira ticket shape

- Project: **SHIP**, issue type: **Bug**, status: **To Do**
- Labels: `auto-log`, `severity-critical|high|medium`, `log-sig-<hash>` (dedupe)
- Summary prefix: `Log:`

Dedupe: `scripts/ship-jira.py create-bug ... --sig "<signature>"` skips when an
open ticket with the same signature label already exists.

### Helper scripts

| Script | Purpose |
| --- | --- |
| `scripts/ship-coolify-logs.mjs` | Fetch Coolify logs, group errors (last 24h) |
| `scripts/ship-jira.py` | SHIP Jira CLI (search, create-bug, comment) |
| `prompts/ship-log-monitor.md` | Full runbook the agent executes each run |

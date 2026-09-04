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

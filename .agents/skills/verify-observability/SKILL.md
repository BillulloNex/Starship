---
name: verify-observability
description: >
  End-to-end verification of GrokBot's observability stack (Langfuse, Datadog, PostHog).
  Use when the user says "verify observability", "check observability", "test observability",
  "run smoke test", or after any deployment to confirm all telemetry pipelines are working.
---

# Verify GrokBot Observability

This skill runs an end-to-end verification of all three observability services
(Langfuse, Datadog, PostHog) against a live GrokBot deployment.

## Prerequisites

The following Coolify runtime env vars must be set on `b13aardv73k5fyl01a80ggzc`:
- `LOCAL_BACKEND_API_KEY` — session API key for auth
- `SMOKE_TEST_LLM_API_KEY` — OpenRouter API key for test LLM calls
- `POSTHOG_PERSONAL_API_KEY` — for querying PostHog data
- `POSTHOG_PROJECT_ID` — PostHog project ID
- `DD_API_KEY` + `DD_APP_KEY` — for Datadog queries
- `LANGFUSE_PUBLIC_KEY` + `LANGFUSE_SECRET_KEY` — for server-side OTEL

## Workflow

### Step 1: Confirm Deployment Health

```bash
# Check app is up
curl -sf https://grok.beenex.org/health
```

If deploying, first verify via Coolify MCP:
- `list_deployments` or `deployment(action: "get")` → status = `finished`

### Step 2: Retrieve API Keys from Coolify

Use the Coolify MCP `env_vars` tool to get the keys needed for the smoke test:

```
env_vars(action="list", resource="application", uuid="b13aardv73k5fyl01a80ggzc", key="LOCAL_BACKEND_API_KEY", reveal=true)
env_vars(action="list", resource="application", uuid="b13aardv73k5fyl01a80ggzc", key="SMOKE_TEST_LLM_API_KEY", reveal=true)
```

### Step 3: Run the Smoke Test

```bash
./scripts/smoke-test.sh \
  --url https://grok.beenex.org \
  --api-key <LOCAL_BACKEND_API_KEY value> \
  --llm-key <SMOKE_TEST_LLM_API_KEY value> \
  --model openrouter/openai/gpt-5.6-luna \
  --timeout 120
```

The script will:
1. ✅ Check `/health` returns 200
2. ✅ Check `/api/observability/datadog/status` — validate DD keys
3. ✅ Check `/api/observability/posthog/status` — validate PostHog keys
4. ✅ Create a conversation with a test prompt
5. ✅ Wait for the agent to respond
6. ✅ Verify assistant events exist
7. 🧹 Clean up the test conversation

Record the **conversation ID** from the output — it's needed for Step 5.

### Step 4: Wait for Telemetry Flush

Wait 30–60 seconds for all telemetry to flush to the backends.

### Step 5: Verify Langfuse

Use the Langfuse MCP tools to check for traces from the smoke test:

```
# List recent observations (last 5 minutes)
listObservations(
  limit=10,
  fromStartTime="<ISO 8601 timestamp 5 min ago>",
  type="GENERATION"
)
```

**Pass criteria:** At least 1 observation exists in the time window.

If you have the conversation ID from the smoke test, you can also search by session:
```
# The langfuse-service uses conversationId as the sessionId
listObservations(limit=5, filter=[{column: "traceId", operator: "contains", value: "<conversation_id>"}])
```

### Step 6: Verify Datadog

```bash
# Status check (validates keys)
curl -sf https://grok.beenex.org/api/observability/datadog/status | python3 -m json.tool

# Summary (checks for recent data)
curl -sf 'https://grok.beenex.org/api/observability/datadog/summary?timeframe=15m' | python3 -m json.tool

# Check recent logs for errors
curl -sf 'https://grok.beenex.org/api/observability/datadog/logs?timeframe=15m&status=error' | python3 -m json.tool
```

**Pass criteria:**
- `status`: `isValidKey=true`, `hasAppKey=true`
- `summary`: `metrics.totalRequests > 0` (may be 0 if no DD Agent — that's the agentless limitation)
- No critical errors in logs

### Step 7: Verify PostHog

```bash
# Status check
curl -sf https://grok.beenex.org/api/observability/posthog/status | python3 -m json.tool

# Recent events
curl -sf 'https://grok.beenex.org/api/observability/posthog/events?limit=10' | python3 -m json.tool
```

**Pass criteria:**
- `status`: `isValidKey=true`, project info present
- `events`: `count > 0`, recent events visible

### Step 8: Generate Report

Create an artifact summarizing results:

```markdown
# Observability Verification Report

| Service  | Component        | Status | Details |
|----------|-----------------|--------|---------|
| Health   | /health         | ✅/❌  | ...     |
| Datadog  | API Key         | ✅/❌  | ...     |
| Datadog  | App Key         | ✅/❌  | ...     |
| Datadog  | Metrics         | ✅/❌  | ...     |
| PostHog  | API Key         | ✅/❌  | ...     |
| PostHog  | Events          | ✅/❌  | ...     |
| Langfuse | Observations    | ✅/❌  | ...     |
| Smoke    | Conversation    | ✅/❌  | ...     |
| Smoke    | Agent Response  | ✅/❌  | ...     |
```

## Troubleshooting

### Langfuse: No observations found
- Check container startup logs for: `Langfuse OTEL telemetry configured`
- The browser SDK requires `VITE_LANGFUSE_PUBLIC_KEY` + `VITE_LANGFUSE_BASE_URL` (build-time)
- The server OTEL path requires `LANGFUSE_PUBLIC_KEY` + `LANGFUSE_SECRET_KEY` (runtime)

### Datadog: isValidKey=false
- Check `DD_API_KEY` value in Coolify is correct
- Verify the site matches: `DD_SITE` should be `us5.datadoghq.com`

### Datadog: No LLMObs spans
- Check container logs for `[grokbot-sitecustomize] LLMObs.enable() OK`
- If missing, check `DD_LLMOBS_ENABLED` is set to `1`
- Check `PYTHONPATH` includes `/opt/agent-canvas/tools`

### PostHog: isValidKey=false
- Check `POSTHOG_PERSONAL_API_KEY` is a valid Personal API Key (starts with `phx_`)
- Check `POSTHOG_PROJECT_ID` matches your project

### Smoke test: Conversation fails
- Check the LLM API key is valid for the model
- For OpenRouter models, the model format is `openrouter/<provider>/<model>`
- Check container logs for LLM errors during the test window

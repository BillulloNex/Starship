#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# GrokBot Smoke Test
#
# Tests a live GrokBot deployment by creating a real conversation, triggering
# an LLM call, and verifying the response. Designed to be run by an agent or
# human after deployment.
#
# Usage:
#   ./scripts/smoke-test.sh \
#     --url https://grok.beenex.org \
#     --api-key <SESSION_API_KEY> \
#     --llm-key <LLM_API_KEY> \
#     [--model openrouter/openai/gpt-5.6-luna] \
#     [--timeout 120]
#
# Exit codes:
#   0 = all checks passed
#   1 = one or more checks failed
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Defaults ──
BASE_URL=""
API_KEY=""
LLM_KEY=""
MODEL="openrouter/openai/gpt-5.6-luna"
TIMEOUT=120
CONV_ID=""
CLEANUP=true

# ── Parse args ──
while [[ $# -gt 0 ]]; do
  case $1 in
    --url)       BASE_URL="$2"; shift 2 ;;
    --api-key)   API_KEY="$2"; shift 2 ;;
    --llm-key)   LLM_KEY="$2"; shift 2 ;;
    --model)     MODEL="$2"; shift 2 ;;
    --timeout)   TIMEOUT="$2"; shift 2 ;;
    --no-cleanup) CLEANUP=false; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [[ -z "$BASE_URL" || -z "$API_KEY" || -z "$LLM_KEY" ]]; then
  echo "ERROR: --url, --api-key, and --llm-key are required"
  exit 1
fi

# Strip trailing slash
BASE_URL="${BASE_URL%/}"

# ── Helpers ──
PASS=0
FAIL=0
RESULTS=()

check() {
  local name="$1" ok="$2" detail="${3:-}"
  if [[ "$ok" == "true" ]]; then
    RESULTS+=("✅ $name")
    ((PASS++)) || true
  else
    RESULTS+=("❌ $name${detail:+ — $detail}")
    ((FAIL++)) || true
  fi
}

api() {
  local method="$1" path="$2"
  shift 2
  curl -sf --max-time 30 \
    -X "$method" \
    -H "X-Session-API-Key: $API_KEY" \
    -H "Content-Type: application/json" \
    "$BASE_URL$path" "$@"
}

cleanup_conversation() {
  if [[ -n "$CONV_ID" && "$CLEANUP" == "true" ]]; then
    echo "🧹 Cleaning up conversation $CONV_ID..."
    api DELETE "/api/conversations/$CONV_ID" 2>/dev/null || true
  fi
}
trap cleanup_conversation EXIT

echo "═══════════════════════════════════════════════════"
echo "  GrokBot Smoke Test"
echo "  Target: $BASE_URL"
echo "  Model:  $MODEL"
echo "═══════════════════════════════════════════════════"
echo ""

# ── 1. Health Check ──
echo "📋 Step 1: Health check..."
HEALTH=$(curl -sf --max-time 10 "$BASE_URL/health" 2>/dev/null) || HEALTH=""
check "Health endpoint" "$([[ -n "$HEALTH" ]] && echo true || echo false)" "$HEALTH"

# ── 1a. Frontend HTML Check ──
echo "📋 Step 1a: Frontend HTML check..."
HTML_CONTENT=$(curl -s --max-time 10 "$BASE_URL/" 2>/dev/null) || HTML_CONTENT=""
HAS_UI_TAG=$(echo "$HTML_CONTENT" | grep -q 'data-agent-server-ui' && echo "true" || echo "false")
check "Frontend HTML serves data-agent-server-ui" "$HAS_UI_TAG"

# ── 1b. Static Asset Check ──
echo "📋 Step 1b: Static asset check..."
ASSET_PATH=$(echo "$HTML_CONTENT" | grep -o 'src="/assets/[^"]*"' | head -n 1 | sed 's/src="//; s/"//' || true)
if [[ -n "$ASSET_PATH" ]]; then
  ASSET_CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL$ASSET_PATH" 2>/dev/null) || ASSET_CODE="000"
  check "Static asset loads ($ASSET_PATH)" "$([[ "$ASSET_CODE" == "200" ]] && echo true || echo false)" "HTTP $ASSET_CODE"
else
  check "Static asset loads" "false" "No /assets/ script found in HTML"
fi

# ── 2. Datadog Status ──
echo "📋 Step 2: Datadog status..."
DD_STATUS=$(curl -sf --max-time 10 "$BASE_URL/api/observability/datadog/status" 2>/dev/null) || DD_STATUS="{}"
DD_VALID=$(echo "$DD_STATUS" | python3 -c "import json,sys; d=json.load(sys.stdin); print('true' if d.get('isValidKey') else 'false')" 2>/dev/null) || DD_VALID="false"
DD_HAS_APP=$(echo "$DD_STATUS" | python3 -c "import json,sys; d=json.load(sys.stdin); print('true' if d.get('hasAppKey') else 'false')" 2>/dev/null) || DD_HAS_APP="false"
check "Datadog API key valid" "$DD_VALID"
check "Datadog App key present" "$DD_HAS_APP"

# ── 3. PostHog Status ──
echo "📋 Step 3: PostHog status..."
PH_STATUS=$(curl -sf --max-time 10 "$BASE_URL/api/observability/posthog/status" 2>/dev/null) || PH_STATUS="{}"
PH_VALID=$(echo "$PH_STATUS" | python3 -c "import json,sys; d=json.load(sys.stdin); print('true' if d.get('isValidKey') else 'false')" 2>/dev/null) || PH_VALID="false"
check "PostHog API key valid" "$PH_VALID"

# ── 4. Create Conversation ──
echo "📋 Step 4: Creating test conversation..."
CREATE_BODY=$(cat <<EOF
{
  "workspace": {
    "working_dir": "/tmp/smoke-test",
    "kind": "LocalWorkspace"
  },
  "initial_message": {
    "content": [{"text": "Say exactly: SMOKE_TEST_OK. Nothing else."}]
  },
  "agent": {
    "llm": {
      "model": "$MODEL",
      "api_key": "$LLM_KEY"
    }
  }
}
EOF
)

CREATE_RESP=$(api POST "/api/conversations" -d "$CREATE_BODY" 2>/dev/null) || CREATE_RESP=""
CONV_ID=$(echo "$CREATE_RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('conversation_id', d.get('id', '')))" 2>/dev/null) || CONV_ID=""

if [[ -n "$CONV_ID" ]]; then
  check "Conversation created" "true"
  echo "   → Conversation ID: $CONV_ID"
else
  check "Conversation created" "false" "Response: ${CREATE_RESP:0:200}"
  echo ""
  echo "═══════════════════════════════════════════════════"
  echo "  RESULTS"
  echo "═══════════════════════════════════════════════════"
  for r in "${RESULTS[@]}"; do echo "  $r"; done
  echo ""
  echo "  Passed: $PASS  Failed: $FAIL"
  exit 1
fi

# ── 5. Wait for Agent Response ──
echo "📋 Step 5: Waiting for agent response (timeout: ${TIMEOUT}s)..."
ELAPSED=0
AGENT_STATUS=""
HAS_RESPONSE=false

while [[ $ELAPSED -lt $TIMEOUT ]]; do
  sleep 3
  ELAPSED=$((ELAPSED + 3))

  CONV_DETAIL=$(api GET "/api/conversations/$CONV_ID" 2>/dev/null) || CONV_DETAIL="{}"
  AGENT_STATUS=$(echo "$CONV_DETAIL" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('execution_status', d.get('status', '')))" 2>/dev/null) || AGENT_STATUS=""

  if [[ "$AGENT_STATUS" == "idle" || "$AGENT_STATUS" == "stopped" || "$AGENT_STATUS" == "finished" || \
        "$AGENT_STATUS" == "IDLE" || "$AGENT_STATUS" == "STOPPED" || "$AGENT_STATUS" == "FINISHED" ]]; then
    HAS_RESPONSE=true
    break
  fi

  # Also check for error states
  if [[ "$AGENT_STATUS" == "ERROR" || "$AGENT_STATUS" == "PAUSED" || \
        "$AGENT_STATUS" == "error" || "$AGENT_STATUS" == "paused" ]]; then
    break
  fi

  printf "   ⏳ %ds — status: %s\r" "$ELAPSED" "${AGENT_STATUS:-pending}"
done
echo ""

check "Agent responded" "$HAS_RESPONSE" "status=$AGENT_STATUS after ${ELAPSED}s"

# ── 6. Verify Events ──
if [[ "$HAS_RESPONSE" == "true" ]]; then
  echo "📋 Step 6: Checking conversation events..."
  EVENTS=$(api GET "/api/conversations/$CONV_ID/events/search?source=agent&limit=5" 2>/dev/null) || EVENTS="[]"
  EVENT_COUNT=$(echo "$EVENTS" | python3 -c "
import json, sys
data = json.load(sys.stdin)
events = data if isinstance(data, list) else data.get('events', data.get('results', data.get('items', [])))
print(len(events))
" 2>/dev/null) || EVENT_COUNT="0"

  check "Agent events received" "$([[ "${EVENT_COUNT:-0}" -gt 0 ]] && echo true || echo false)" "count=$EVENT_COUNT"
else
  check "Agent events received" "false" "skipped (no response)"
fi

# ── 6a. LLM Profile Round-Trip ──
echo "📋 Step 6a: LLM Profile round-trip..."
PROFILE_ID="smoke-test-profile"
api POST "/api/profiles/$PROFILE_ID" -d '{"name":"Smoke Test Profile"}' >/dev/null 2>&1 || true
api POST "/api/profiles/$PROFILE_ID/activate" >/dev/null 2>&1 || true
ACTIVE_PROF_ID=$(api GET "/api/profiles/active" 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))" 2>/dev/null) || ACTIVE_PROF_ID=""
api DELETE "/api/profiles/$PROFILE_ID" >/dev/null 2>&1 || true

check "Profile round-trip (create->activate->verify->delete)" "$([[ "$ACTIVE_PROF_ID" == "$PROFILE_ID" ]] && echo true || echo false)" "Active profile: $ACTIVE_PROF_ID"

# ── 7. Summary ──
echo ""
echo "═══════════════════════════════════════════════════"
echo "  RESULTS"
echo "═══════════════════════════════════════════════════"
for r in "${RESULTS[@]}"; do echo "  $r"; done
echo ""
echo "  Passed: $PASS  Failed: $FAIL"
echo "  Conversation: $CONV_ID"
echo "═══════════════════════════════════════════════════"

if [[ $FAIL -gt 0 ]]; then
  exit 1
fi
exit 0

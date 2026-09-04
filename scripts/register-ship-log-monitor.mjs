#!/usr/bin/env node
/**
 * Register the SHIP Log Monitor cron automation.
 *
 * Note: the automation API model field does not accept bracket options like
 * [fast=false]. For Composer 2.5 with fast=false, use the ACP orchestrator
 * (ship-log-monitor-orchestrator.mjs + SHIP-LogMonitor agent profile) instead.
 * This cron automation uses composer-2.5 on the OpenHands harness as a fallback.
 *
 * Usage:
 *   node scripts/register-ship-log-monitor.mjs
 *   node scripts/register-ship-log-monitor.mjs --dispatch
 */

const API_BASE = (
  process.env.SHIP_AUTOMATION_URL || "http://127.0.0.1:8000/api/automation/v1"
).replace(/\/$/, "");

const API_KEY =
  process.env.OPENHANDS_AUTOMATION_API_KEY ||
  process.env.LOCAL_BACKEND_API_KEY ||
  process.env.X_SESSION_API_KEY ||
  "";

const REPO = process.env.SHIP_REPO_DIR || "/projects/Grokbot";

const AUTOMATION = {
  name: "SHIP Log Monitor",
  model: "composer-2.5",
  timeout: 1800,
  trigger: {
    type: "cron",
    schedule: process.env.SHIP_LOG_MONITOR_CRON || "0 6 * * *",
    timezone: process.env.SHIP_LOG_MONITOR_TZ || "America/New_York",
  },
  prompt: `You are the SHIP Log Monitor automation. Execute exactly, do not improvise scope.

1. Read ${REPO}/prompts/ship-log-monitor.md and follow it step by step.
2. Return ONLY the JSON object described in section 6 of that runbook.

Note: prefer the background ACP orchestrator (SHIP-LogMonitor profile, composer-2.5 fast=false) when enabled — disable this cron if both would run on the same schedule.`,
};

async function request(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(API_KEY ? { "X-Session-API-Key": API_KEY } : {}),
    ...(options.headers || {}),
  };
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const body = await response.text();
  if (!response.ok) throw new Error(`${response.status}: ${body.slice(0, 500)}`);
  return body ? JSON.parse(body) : null;
}

async function main() {
  const dispatch = process.argv.includes("--dispatch");
  const existing = await request("");
  const match = existing.automations?.find((item) => item.name === AUTOMATION.name);
  if (match) {
    console.log(`Automation already exists: ${match.id} (enabled=${match.enabled})`);
    if (dispatch) {
      const run = await request(`/${match.id}/dispatch`, { method: "POST" });
      console.log(`Dispatched run ${run.id}`);
    }
    return;
  }

  const created = await request("/preset/prompt", {
    method: "POST",
    body: JSON.stringify(AUTOMATION),
  });
  await request(`/${created.id}`, {
    method: "PATCH",
    body: JSON.stringify({ enabled: false }),
  });
  console.log(`Created automation ${created.id}: ${created.name} (disabled — ACP orchestrator is primary)`);
  if (dispatch) {
    const run = await request(`/${created.id}/dispatch`, { method: "POST" });
    console.log(`Dispatched run ${run.id}`);
  }
}

main().catch((error) => {
  console.error(`[register-ship-log-monitor] ${error.stack || error.message}`);
  process.exitCode = 1;
});

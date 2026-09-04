#!/usr/bin/env node

/**
 * Daily Coolify log scanner for Starship (ship.beenex.org).
 *
 * Launches a Cursor ACP conversation (SHIP-LogMonitor / composer-2.5 fast=false)
 * to analyze the last 24 hours of Coolify container logs and file SHIP Jira Bugs
 * in To Do for the ship-jira-orchestrator to pick up.
 */

import fs from "node:fs/promises";
import path from "node:path";

const CONFIG = {
  repo: process.env.SHIP_REPO_DIR || process.env.AUTO_CLONE_TARGET || "/projects/Grokbot",
  agentUrl: process.env.SHIP_AGENT_URL || "http://127.0.0.1:18000",
  intervalMs: Number(process.env.SHIP_LOG_MONITOR_INTERVAL_MS || 86_400_000),
  scheduleHour: Number(process.env.SHIP_LOG_MONITOR_HOUR ?? 6),
  scheduleMinute: Number(process.env.SHIP_LOG_MONITOR_MINUTE ?? 0),
  timezone: process.env.SHIP_LOG_MONITOR_TZ || "America/New_York",
  stateFile:
    process.env.SHIP_LOG_MONITOR_STATE_FILE ||
    "/home/openhands/.openhands/ship-automation/log-monitor-state.json",
  conversationTimeoutMs: Number(process.env.SHIP_LOG_MONITOR_TIMEOUT_MS || 1_800_000),
};

const PROFILE_NAME = "SHIP-LogMonitor";
const TERMINAL = new Set(["idle", "stopped", "finished", "error", "paused"]);

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(url, options = {}, retries = 2) {
  let last;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, options);
      const body = await response.text();
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${body.slice(0, 500)}`);
      if (!body) return null;
      try {
        return JSON.parse(body);
      } catch {
        return body;
      }
    } catch (error) {
      last = error;
      if (attempt < retries) await sleep(1000 * 2 ** attempt);
    }
  }
  throw last;
}

async function loadState() {
  try {
    return JSON.parse(await fs.readFile(CONFIG.stateFile, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { lastRunAt: null, lastResult: null, running: false };
  }
}

async function saveState(state) {
  await fs.mkdir(path.dirname(CONFIG.stateFile), { recursive: true });
  const temp = `${CONFIG.stateFile}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temp, CONFIG.stateFile);
}

async function profileId() {
  const data = await request(`${CONFIG.agentUrl}/api/agent-profiles`);
  const profile = data.profiles.find((item) => item.name === PROFILE_NAME);
  if (!profile) {
    throw new Error(
      `Required agent profile ${PROFILE_NAME} does not exist. Create a Cursor ACP profile using composer-2.5[fast=false].`,
    );
  }
  return profile.id;
}

function monitorPrompt() {
  return `You are SHIP Log Monitor. Read and execute the live runbook at ${CONFIG.repo}/prompts/ship-log-monitor.md exactly.

Do not edit repository code, redeploy, restart containers, or modify existing Jira tickets except creating new SHIP Bugs as instructed.

Return ONLY the JSON object described in section 6 of the runbook.`;
}

async function launch(profile, prompt) {
  const data = await request(`${CONFIG.agentUrl}/api/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspace: { kind: "LocalWorkspace", working_dir: CONFIG.repo },
      worktree: false,
      max_iterations: 120,
      confirmation_policy: { kind: "NeverConfirm" },
      agent_profile_id: profile,
      initial_message: { role: "user", content: [{ type: "text", text: prompt }], run: true },
      tags: { automation: "ship-log-monitor" },
      autotitle: false,
    }),
  });
  return data.id;
}

async function waitForConversation(id) {
  const deadline = Date.now() + CONFIG.conversationTimeoutMs;
  await sleep(3_000);
  while (Date.now() < deadline) {
    const [conversation] = await request(`${CONFIG.agentUrl}/api/conversations?ids=${id}`);
    const status = String(conversation?.execution_status || "").toLowerCase();
    if (TERMINAL.has(status)) {
      const result = await request(`${CONFIG.agentUrl}/api/conversations/${id}/agent_final_response`);
      if (result?.response || status === "error" || status === "stopped" || status === "paused") {
        return { status, response: result?.response || "" };
      }
    }
    await sleep(10_000);
  }
  throw new Error(`Conversation ${id} exceeded timeout`);
}

function localParts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return { hour: Number(parts.hour), minute: Number(parts.minute) };
}

function dueForRun(state) {
  const now = new Date();
  const { hour, minute } = localParts(now, CONFIG.timezone);
  if (hour !== CONFIG.scheduleHour || minute !== CONFIG.scheduleMinute) return false;
  if (!state.lastRunAt) return true;
  const last = new Date(state.lastRunAt);
  const sameLocalDay =
    last.toLocaleDateString("en-US", { timeZone: CONFIG.timezone }) ===
    now.toLocaleDateString("en-US", { timeZone: CONFIG.timezone });
  return !sameLocalDay;
}

export async function runOnce() {
  const state = await loadState();
  if (state.running) {
    console.warn("[ship-log-monitor] previous run still marked running; skipping");
    return state;
  }
  state.running = true;
  await saveState(state);

  try {
    const profile = await profileId();
    const conversationId = await launch(profile, monitorPrompt());
    console.log(`[ship-log-monitor] launched conversation ${conversationId}`);
    const result = await waitForConversation(conversationId);
    state.lastRunAt = new Date().toISOString();
    state.lastConversationId = conversationId;
    state.lastResult = {
      status: result.status,
      response: result.response.slice(0, 20_000),
    };
    console.log(`[ship-log-monitor] finished status=${result.status}`);
  } finally {
    state.running = false;
    await saveState(state);
  }
  return state;
}

async function main() {
  console.log(
    `[ship-log-monitor] starting; daily ${String(CONFIG.scheduleHour).padStart(2, "0")}:${String(CONFIG.scheduleMinute).padStart(2, "0")} ${CONFIG.timezone} repo=${CONFIG.repo}`,
  );
  while (true) {
    try {
      const state = await loadState();
      if (dueForRun(state)) await runOnce();
    } catch (error) {
      console.error(`[ship-log-monitor] ${new Date().toISOString()} ${error.stack || error}`);
    }
    await sleep(Math.min(CONFIG.intervalMs, 60_000));
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  if (process.argv.includes("--once")) {
    runOnce().catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
  } else {
    main().catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
  }
}

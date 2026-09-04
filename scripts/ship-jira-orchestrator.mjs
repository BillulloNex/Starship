#!/usr/bin/env node

/**
 * Token-free Jira poller and resumable SHIP delivery orchestrator.
 *
 * Polling and state transitions are ordinary HTTP code. LLM usage starts only
 * after an eligible issue has been claimed and a dedicated conversation is
 * created. State lives on the persistent OpenHands volume so a deployment
 * triggered by the builder can replace this container without losing progress.
 */

import fs from "node:fs/promises";
import path from "node:path";

const CONFIG = {
  project: process.env.SHIP_JIRA_PROJECT || "SHIP",
  pollMs: Number(process.env.SHIP_JIRA_POLL_MS || 120_000),
  repo: process.env.SHIP_REPO_DIR || process.env.AUTO_CLONE_TARGET || "/projects/Grokbot",
  stateFile:
    process.env.SHIP_AUTOMATION_STATE_FILE ||
    "/home/openhands/.openhands/ship-automation/state.json",
  agentUrl: process.env.SHIP_AGENT_URL || "http://127.0.0.1:18000",
  githubRepo: process.env.SHIP_GITHUB_REPO || "ThomasVuNguyen/Starship",
  slackChannel: process.env.SHIP_SLACK_CHANNEL_ID || "",
  maxBuildAttempts: Number(process.env.SHIP_MAX_BUILD_ATTEMPTS || 3),
  conversationTimeoutMs: Number(process.env.SHIP_CONVERSATION_TIMEOUT_MS || 1_800_000),
  deployTimeoutMs: Number(process.env.SHIP_DEPLOY_TIMEOUT_MS || 2_400_000),
};

const PROFILE_NAMES = {
  triage: "SHIP-Triage",
  builder: "SHIP-Builder",
  qa: "SHIP-QA",
};

const TERMINAL = new Set(["idle", "stopped", "finished", "error", "paused"]);

export function extractJson(text) {
  if (!text) return null;
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] || text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

export function normalizeOutcome(text, phase) {
  const parsed = extractJson(text) || {};
  if (phase === "triage") {
    return {
      decision: parsed.decision === "clarification" ? "clarification" : "ready",
      comment: String(parsed.comment || parsed.reason || "").trim(),
    };
  }
  if (phase === "qa") {
    return {
      passed: parsed.result === "pass" || parsed.passed === true,
      comment: String(parsed.comment || parsed.summary || text || "").trim(),
    };
  }
  return {
    success: parsed.result === "success" || parsed.success === true,
    commit: String(parsed.commit || parsed.sha || "").trim(),
    comment: String(parsed.comment || parsed.summary || text || "").trim(),
  };
}

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

async function secret(name) {
  if (process.env[name]) return process.env[name];
  const payload = await request(`${CONFIG.agentUrl}/api/settings/secrets/${encodeURIComponent(name)}`);
  const value = typeof payload === "string" ? payload : payload?.secret ?? payload?.value;
  if (!value) throw new Error(`Required secret ${name} is unavailable`);
  return value;
}

async function credentials() {
  const [jiraUrl, jiraUser, jiraToken, githubToken, slackToken] = await Promise.all([
    secret("JIRA_URL"),
    secret("JIRA_USERNAME"),
    secret("JIRA_API_TOKEN"),
    secret("GITHUB_PERSONAL_ACCESS_TOKEN"),
    secret("SLACK_BOT_TOKEN"),
  ]);
  return { jiraUrl: jiraUrl.replace(/\/$/, ""), jiraUser, jiraToken, githubToken, slackToken };
}

function jiraHeaders(creds) {
  return {
    Authorization: `Basic ${Buffer.from(`${creds.jiraUser}:${creds.jiraToken}`).toString("base64")}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

async function jira(creds, pathname, options = {}) {
  return request(`${creds.jiraUrl}${pathname}`, {
    ...options,
    headers: { ...jiraHeaders(creds), ...(options.headers || {}) },
  });
}

async function listCandidates(creds) {
  const jql = `project = ${CONFIG.project} AND status = "To Do" AND issuetype in (Bug, Story, Task, Subtask) ORDER BY created ASC`;
  const data = await jira(creds, "/rest/api/3/search/jql", {
    method: "POST",
    body: JSON.stringify({
      jql,
      maxResults: 20,
      fields: ["summary", "description", "issuetype", "status", "created", "updated", "labels"],
    }),
  });
  return data?.issues || [];
}

async function issueDetails(creds, key) {
  return jira(creds, `/rest/api/3/issue/${key}?expand=renderedFields,names,changelog`);
}

async function transition(creds, key, targetName) {
  const data = await jira(creds, `/rest/api/3/issue/${key}/transitions`);
  const match = data.transitions?.find((item) => item.to?.name === targetName || item.name === targetName);
  if (!match) throw new Error(`No Jira transition from ${key} to ${targetName}`);
  await jira(creds, `/rest/api/3/issue/${key}/transitions`, {
    method: "POST",
    body: JSON.stringify({ transition: { id: match.id } }),
  });
}

async function comment(creds, key, text) {
  if (!text) return;
  await jira(creds, `/rest/api/3/issue/${key}/comment`, {
    method: "POST",
    body: JSON.stringify({
      body: {
        type: "doc",
        version: 1,
        content: [{ type: "paragraph", content: [{ type: "text", text: text.slice(0, 30000) }] }],
      },
    }),
  });
}

async function slack(creds, text) {
  if (!CONFIG.slackChannel) {
    console.warn("[ship-automation] SHIP_SLACK_CHANNEL_ID is not set; Slack notification skipped");
    return;
  }
  const data = await request("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { Authorization: `Bearer ${creds.slackToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ channel: CONFIG.slackChannel, text }),
  });
  if (!data.ok) throw new Error(`Slack error: ${data.error}`);
}

async function loadState() {
  try {
    return JSON.parse(await fs.readFile(CONFIG.stateFile, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { active: null, completed: {} };
  }
}

async function saveState(state) {
  await fs.mkdir(path.dirname(CONFIG.stateFile), { recursive: true });
  const temp = `${CONFIG.stateFile}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temp, CONFIG.stateFile);
}

async function profiles() {
  const data = await request(`${CONFIG.agentUrl}/api/agent-profiles`);
  const byName = Object.fromEntries(data.profiles.map((profile) => [profile.name, profile.id]));
  for (const name of Object.values(PROFILE_NAMES)) {
    if (!byName[name]) throw new Error(`Required agent profile ${name} does not exist`);
  }
  return byName;
}

async function launch(profileId, prompt, key, phase, maxIterations) {
  const data = await request(`${CONFIG.agentUrl}/api/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspace: { kind: "LocalWorkspace", working_dir: CONFIG.repo },
      worktree: false,
      max_iterations: maxIterations,
      confirmation_policy: { kind: "NeverConfirm" },
      agent_profile_id: profileId,
      initial_message: { role: "user", content: [{ type: "text", text: prompt }], run: true },
      tags: { jira: key, phase },
      autotitle: false,
    }),
  });
  return data.id;
}

async function waitForConversation(id) {
  const deadline = Date.now() + CONFIG.conversationTimeoutMs;
  // A newly-created conversation can briefly report idle before its initial
  // message changes it to running. Do not mistake that startup window for a
  // completed run with an empty final response.
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

async function github(creds, pathname) {
  return request(`https://api.github.com/repos/${CONFIG.githubRepo}${pathname}`, {
    headers: {
      Authorization: `Bearer ${creds.githubToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
}

async function findCommit(creds, key, notBefore = 0) {
  const data = await github(creds, "/commits?sha=main&per_page=20");
  return (
    data.find(
      (entry) =>
        entry.commit?.message?.includes(key) &&
        Date.parse(entry.commit?.committer?.date || entry.commit?.author?.date || 0) >= notBefore,
    )?.sha || ""
  );
}

async function waitForDeploy(creds, sha) {
  const deadline = Date.now() + CONFIG.deployTimeoutMs;
  while (Date.now() < deadline) {
    const data = await github(creds, `/actions/runs?head_sha=${sha}&per_page=30`);
    const deploy = data.workflow_runs?.find((run) => run.name === "Deploy to Coolify");
    const guard = data.workflow_runs?.find((run) => run.name === "Version Guard");
    if (deploy?.status === "completed" && guard?.status === "completed") {
      if (deploy.conclusion === "success" && guard.conclusion === "success") {
        return { url: deploy.html_url };
      }
      throw new Error(
        `GitHub checks failed: deploy=${deploy.conclusion}, version-guard=${guard.conclusion}. ` +
          `${deploy.html_url || guard.html_url || ""}`,
      );
    }
    await sleep(15_000);
  }
  throw new Error(`Deployment for ${sha} exceeded timeout`);
}

function triagePrompt(issue) {
  return `You are SHIP Triage. Review Jira issue ${issue.key} for the Starship repository at ${CONFIG.repo}.

Inspect the complete Jira issue, repository code, git history, relevant tests, GitHub Actions, and available runtime/deployment logs. Do not edit files, transition Jira, commit, push, or delete anything. Resolve ambiguity from evidence whenever safely possible. Ask for clarification only when materially different implementations remain and choosing one would change user-visible behavior.

Return ONLY JSON:
{"decision":"ready","comment":"brief implementation interpretation and acceptance checks"}
or
{"decision":"clarification","comment":"specific numbered questions and what evidence you checked"}`;
}

function buildPrompt(issue, triage, attempt) {
  return `You are SHIP Builder. Implement Jira ${issue.key}: ${issue.fields.summary} directly on main in ${CONFIG.repo}.

Triage evidence: ${triage.comment}
Attempt: ${attempt}/${CONFIG.maxBuildAttempts}

Requirements:
- Re-read the Jira issue and inspect relevant code, tests, git history, GitHub Actions, and logs.
- Work only on this ticket. Preserve unrelated user changes. Never delete chats, agent/LLM profiles, MCP tools, or skills.
- Sync origin/main before editing and again immediately before pushing; never force-push.
- Implement completely and run targeted tests plus npm --prefix OpenHands run lint and build when relevant.
- Run node scripts/bump-version.mjs patch|minor|major as required by AGENTS.md.
- Commit directly to main with a message beginning "${issue.key}:" and push origin main.
- Do not transition Jira or trigger Coolify manually. The push triggers deployment.

Return ONLY JSON:
{"result":"success","commit":"full pushed SHA","comment":"concise implementation and test summary"}
If unable to complete, return {"result":"failure","commit":"","comment":"precise blocker and attempts"}.`;
}

function qaPrompt(issue, sha) {
  return `You are SHIP QA, an independent production browser tester. Test Jira ${issue.key}: ${issue.fields.summary} at https://ship.beenex.org after commit ${sha}.

Use browser control. Derive ticket-specific checks from the full Jira issue and also run a focused Starship regression covering boot, API-key gate if shown, navigation, conversation creation/use, and the areas affected by the change. You may create disposable test chats but DO NOT delete any old chats, agent/LLM profiles, MCP tools, or skills. Do not edit code, commit, push, transition Jira, or change production configuration. If the first-boot API key is required, retrieve it securely from Coolify/runtime secrets without printing it.

Capture useful evidence and distinguish product failures from test-environment failures.

Return ONLY JSON:
{"result":"pass","comment":"checks performed and evidence"}
or
{"result":"fail","comment":"exact failure, reproduction steps, expected vs actual, and evidence"}.`;
}

async function failIssue(creds, state, reason) {
  const key = state.active.key;
  await comment(creds, key, `Automation needs attention.\n\n${reason}`);
  await transition(creds, key, "Needs Attention");
  await slack(creds, `:warning: ${key} needs attention\n${reason}`).catch(console.error);
  state.completed[key] = { result: "needs-attention", at: new Date().toISOString() };
  state.active = null;
  await saveState(state);
}

async function runIssue(creds, state, profileIds) {
  const active = state.active;
  const issue = await issueDetails(creds, active.key);

  if (active.phase === "triage") {
    if (!active.conversationId) {
      active.conversationId = await launch(profileIds[PROFILE_NAMES.triage], triagePrompt(issue), issue.key, "triage", 80);
      await saveState(state);
    }
    const result = await waitForConversation(active.conversationId);
    const outcome = normalizeOutcome(result.response, "triage");
    if (result.status === "error" || outcome.decision === "clarification") {
      const text = outcome.comment || "Triage could not determine a safe implementation. Please add acceptance criteria.";
      await comment(creds, issue.key, `Needs clarification.\n\n${text}`);
      await transition(creds, issue.key, "Needs Clarification");
      state.completed[issue.key] = { result: "needs-clarification", at: new Date().toISOString() };
      state.active = null;
      return saveState(state);
    }
    active.triage = outcome;
    active.phase = "build";
    active.attempt = 1;
    active.conversationId = null;
    await saveState(state);
  }

  if (active.phase === "build") {
    // A successful push can replace the container before the conversation's
    // final response is observed. Recover by recognizing the Jira-keyed commit.
    if (active.conversationId) {
      const recoveredCommit = await findCommit(creds, issue.key, Date.parse(active.startedAt));
      if (recoveredCommit) {
        active.commit = recoveredCommit;
        active.buildComment = "Recovered the pushed commit after a container replacement.";
        active.phase = "deploy";
        active.conversationId = null;
        await saveState(state);
      }
    }
  }

  if (active.phase === "build") {
    if (!active.conversationId) {
      active.conversationId = await launch(
        profileIds[PROFILE_NAMES.builder],
        buildPrompt(issue, active.triage, active.attempt),
        issue.key,
        "build",
        300,
      );
      await saveState(state);
    }
    const result = await waitForConversation(active.conversationId);
    const outcome = normalizeOutcome(result.response, "build");
    const sha = outcome.commit || (await findCommit(creds, issue.key, Date.parse(active.startedAt)));
    if (result.status === "error" || !outcome.success || !/^[0-9a-f]{40}$/i.test(sha)) {
      if (active.attempt < CONFIG.maxBuildAttempts) {
        active.attempt += 1;
        active.conversationId = null;
        active.lastFailure = outcome.comment || `Builder ended with ${result.status}`;
        await saveState(state);
        return;
      }
      return failIssue(creds, state, outcome.comment || `Builder failed after ${active.attempt} attempts`);
    }
    active.commit = sha;
    active.buildComment = outcome.comment;
    active.phase = "deploy";
    active.conversationId = null;
    await saveState(state);
  }

  if (active.phase === "deploy") {
    try {
      const deployment = await waitForDeploy(creds, active.commit);
      await comment(
        creds,
        issue.key,
        `Implemented and deployed to production.\n\nCommit: https://github.com/${CONFIG.githubRepo}/commit/${active.commit}\nActions: ${deployment.url}\n${active.buildComment || ""}`,
      );
      await transition(creds, issue.key, "Deployed To Test");
      active.phase = "qa";
      await transition(creds, issue.key, "In Review / QA");
      await saveState(state);
    } catch (error) {
      return failIssue(creds, state, error.message);
    }
  }

  if (active.phase === "qa") {
    if (!active.conversationId) {
      active.conversationId = await launch(
        profileIds[PROFILE_NAMES.qa],
        qaPrompt(issue, active.commit),
        issue.key,
        "qa",
        180,
      );
      await saveState(state);
    }
    const result = await waitForConversation(active.conversationId);
    const outcome = normalizeOutcome(result.response, "qa");
    if (result.status === "error" || !outcome.passed) {
      return failIssue(creds, state, outcome.comment || `QA ended with ${result.status}`);
    }
    await comment(creds, issue.key, `Production browser QA passed.\n\n${outcome.comment}`);
    await transition(creds, issue.key, "Done");
    await slack(
      creds,
      `:white_check_mark: ${issue.key} is done and live\n${issue.fields.summary}\nhttps://github.com/${CONFIG.githubRepo}/commit/${active.commit}`,
    ).catch(console.error);
    state.completed[issue.key] = { result: "done", commit: active.commit, at: new Date().toISOString() };
    state.active = null;
    await saveState(state);
  }
}

async function tick(creds, state, profileIds) {
  if (state.active) return runIssue(creds, state, profileIds);
  const [candidate] = await listCandidates(creds);
  if (!candidate) return;
  state.active = { key: candidate.key, phase: "triage", conversationId: null, startedAt: new Date().toISOString() };
  await saveState(state);
  await transition(creds, candidate.key, "In Progress");
  await comment(creds, candidate.key, "Starship automation claimed this issue and started evidence-based triage.");
}

async function main() {
  console.log(`[ship-automation] starting; poll=${CONFIG.pollMs}ms project=${CONFIG.project} repo=${CONFIG.repo}`);
  while (true) {
    try {
      const creds = await credentials();
      const state = await loadState();
      const profileIds = await profiles();
      await tick(creds, state, profileIds);
    } catch (error) {
      console.error(`[ship-automation] ${new Date().toISOString()} ${error.stack || error}`);
    }
    await sleep(CONFIG.pollMs);
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

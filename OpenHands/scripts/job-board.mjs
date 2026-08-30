/**
 * Grokbot Job Board — persistent kanban store, HTTP API, and grokbot-job CLI.
 *
 * Jobs live in /projects/.grokbot/jobs.json so they survive container rebuilds.
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const JOB_STATUSES = [
  "backlog",
  "ready",
  "in_progress",
  "review",
  "done",
  "blocked",
];

export const DEFAULT_JOBS_PATH =
  process.env.GROKBOT_JOBS_PATH ||
  (existsSync("/projects")
    ? "/projects/.grokbot/jobs.json"
    : path.resolve("jobs.json"));

const JOBS_API_PREFIX = "/api/jobs";

let writeLock = Promise.resolve();

function nowIso() {
  return new Date().toISOString();
}

function newJobId() {
  return `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeActor(raw, fallbackName = "unknown") {
  if (!raw) return { kind: "human", name: fallbackName };
  if (typeof raw === "string") {
    return { kind: "human", name: raw.trim() || fallbackName };
  }
  const kind = ["human", "agent", "automation"].includes(raw.kind)
    ? raw.kind
    : "human";
  const name = String(raw.name ?? fallbackName).trim() || fallbackName;
  return { kind, name };
}

function actorLabel(actor) {
  if (!actor) return null;
  return actor.name || actor.kind || null;
}

export function defaultSettings() {
  return {
    autoDispatch: false,
    maxActive: 2,
  };
}

export async function loadBoard(jobsPath = DEFAULT_JOBS_PATH) {
  try {
    const raw = await readFile(jobsPath, "utf8");
    const data = JSON.parse(raw);
    if (Array.isArray(data)) {
      return { jobs: data, settings: defaultSettings() };
    }
    return {
      jobs: Array.isArray(data.jobs) ? data.jobs : [],
      settings: { ...defaultSettings(), ...(data.settings ?? {}) },
    };
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.warn(`[job-board] Failed to read ${jobsPath}:`, err.message);
    }
    return { jobs: [], settings: defaultSettings() };
  }
}

export async function saveBoard(board, jobsPath = DEFAULT_JOBS_PATH) {
  const op = async () => {
    const dir = path.dirname(jobsPath);
    await mkdir(dir, { recursive: true });
    const tempPath = `${jobsPath}.tmp.${process.pid}.${Date.now()}`;
    await writeFile(tempPath, JSON.stringify(board, null, 2), "utf8");
    await rename(tempPath, jobsPath);
  };
  writeLock = writeLock.then(op, op);
  return writeLock;
}

async function mutateBoard(mutator, jobsPath = DEFAULT_JOBS_PATH) {
  let result;
  const op = async () => {
    const board = await loadBoard(jobsPath);
    result = await mutator(board);
    const dir = path.dirname(jobsPath);
    await mkdir(dir, { recursive: true });
    const tempPath = `${jobsPath}.tmp.${process.pid}.${Date.now()}`;
    await writeFile(tempPath, JSON.stringify(board, null, 2), "utf8");
    await rename(tempPath, jobsPath);
  };
  writeLock = writeLock.then(op, op);
  await writeLock;
  return result;
}

export function createJobRecord(input = {}) {
  const title = String(input.title ?? "").trim();
  if (!title) throw new Error("Job title is required");
  const status = JOB_STATUSES.includes(input.status) ? input.status : "backlog";
  const createdAt = nowIso();
  return {
    id: input.id || newJobId(),
    title,
    details: String(input.details ?? "").trim(),
    status,
    source: normalizeActor(input.source, "human"),
    assignee: input.assignee ? String(input.assignee).trim() : null,
    reviewer: input.reviewer ? String(input.reviewer).trim() : null,
    reviewRequired: Boolean(input.reviewRequired || input.reviewer),
    workspace: input.workspace ? String(input.workspace).trim() : null,
    conversationId: input.conversationId ?? null,
    result: input.result ?? null,
    createdAt,
    updatedAt: createdAt,
    claimedAt: null,
    completedAt: null,
    reviewedAt: null,
    completedBy: null,
    reviewedBy: null,
  };
}

export async function listJobs(jobsPath = DEFAULT_JOBS_PATH) {
  const board = await loadBoard(jobsPath);
  return board.jobs.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function getJob(id, jobsPath = DEFAULT_JOBS_PATH) {
  const board = await loadBoard(jobsPath);
  return board.jobs.find((job) => job.id === id) ?? null;
}

export async function addJob(input, jobsPath = DEFAULT_JOBS_PATH) {
  const job = createJobRecord(input);
  await mutateBoard((board) => {
    board.jobs.push(job);
    return job;
  }, jobsPath);
  return job;
}

export async function updateJob(id, patch, jobsPath = DEFAULT_JOBS_PATH) {
  return mutateBoard((board) => {
    const job = board.jobs.find((item) => item.id === id);
    if (!job) throw new Error(`Job not found: ${id}`);
    if (patch.title !== undefined) {
      const title = String(patch.title).trim();
      if (!title) throw new Error("Job title is required");
      job.title = title;
    }
    if (patch.details !== undefined) job.details = String(patch.details);
    if (patch.status !== undefined) {
      if (!JOB_STATUSES.includes(patch.status)) {
        throw new Error(`Invalid status: ${patch.status}`);
      }
      job.status = patch.status;
    }
    if (patch.source !== undefined) job.source = normalizeActor(patch.source);
    if (patch.assignee !== undefined) {
      job.assignee = patch.assignee ? String(patch.assignee).trim() : null;
    }
    if (patch.reviewer !== undefined) {
      job.reviewer = patch.reviewer ? String(patch.reviewer).trim() : null;
      if (job.reviewer) job.reviewRequired = true;
    }
    if (patch.reviewRequired !== undefined) {
      job.reviewRequired = Boolean(patch.reviewRequired);
    }
    if (patch.workspace !== undefined) {
      job.workspace = patch.workspace ? String(patch.workspace).trim() : null;
    }
    if (patch.conversationId !== undefined) {
      job.conversationId = patch.conversationId || null;
    }
    if (patch.result !== undefined) job.result = patch.result;
    job.updatedAt = nowIso();
    return job;
  }, jobsPath);
}

export async function claimJob(id, actor, jobsPath = DEFAULT_JOBS_PATH) {
  return mutateBoard((board) => {
    const job = board.jobs.find((item) => item.id === id);
    if (!job) throw new Error(`Job not found: ${id}`);
    if (!["backlog", "ready", "blocked"].includes(job.status)) {
      throw new Error(`Job ${id} cannot be claimed from ${job.status}`);
    }
    const claimedBy = actorLabel(normalizeActor(actor, "agent"));
    job.status = "in_progress";
    job.assignee = claimedBy;
    job.claimedAt = nowIso();
    job.updatedAt = job.claimedAt;
    return job;
  }, jobsPath);
}

export async function releaseJob(id, jobsPath = DEFAULT_JOBS_PATH) {
  return mutateBoard((board) => {
    const job = board.jobs.find((item) => item.id === id);
    if (!job) throw new Error(`Job not found: ${id}`);
    job.status = "ready";
    job.assignee = null;
    job.claimedAt = null;
    job.updatedAt = nowIso();
    return job;
  }, jobsPath);
}

export async function completeJob(
  id,
  { actor, result } = {},
  jobsPath = DEFAULT_JOBS_PATH,
) {
  return mutateBoard((board) => {
    const job = board.jobs.find((item) => item.id === id);
    if (!job) throw new Error(`Job not found: ${id}`);
    const completedBy = actorLabel(normalizeActor(actor, job.assignee || "agent"));
    job.result = result ?? job.result;
    job.completedBy = completedBy;
    job.completedAt = nowIso();
    job.updatedAt = job.completedAt;
    job.status = job.reviewRequired ? "review" : "done";
    return job;
  }, jobsPath);
}

export async function reviewJob(
  id,
  { actor, decision, notes } = {},
  jobsPath = DEFAULT_JOBS_PATH,
) {
  const verdict = String(decision ?? "").toLowerCase();
  if (!["accept", "reject"].includes(verdict)) {
    throw new Error("Review decision must be accept or reject");
  }
  return mutateBoard((board) => {
    const job = board.jobs.find((item) => item.id === id);
    if (!job) throw new Error(`Job not found: ${id}`);
    if (job.status !== "review") {
      throw new Error(`Job ${id} is not awaiting review`);
    }
    const reviewedBy = actorLabel(normalizeActor(actor, "reviewer"));
    job.reviewedBy = reviewedBy;
    job.reviewedAt = nowIso();
    job.updatedAt = job.reviewedAt;
    if (notes) {
      job.result = [job.result, `Review notes: ${notes}`]
        .filter(Boolean)
        .join("\n\n");
    }
    if (verdict === "accept") {
      job.status = "done";
    } else {
      job.status = "ready";
      job.assignee = null;
      job.claimedAt = null;
    }
    return job;
  }, jobsPath);
}

export async function deleteJob(id, jobsPath = DEFAULT_JOBS_PATH) {
  return mutateBoard((board) => {
    const index = board.jobs.findIndex((item) => item.id === id);
    if (index < 0) throw new Error(`Job not found: ${id}`);
    const [removed] = board.jobs.splice(index, 1);
    return removed;
  }, jobsPath);
}

export async function getSettings(jobsPath = DEFAULT_JOBS_PATH) {
  const board = await loadBoard(jobsPath);
  return board.settings;
}

export async function updateSettings(patch, jobsPath = DEFAULT_JOBS_PATH) {
  return mutateBoard((board) => {
    if (patch.autoDispatch !== undefined) {
      board.settings.autoDispatch = Boolean(patch.autoDispatch);
    }
    if (patch.maxActive !== undefined) {
      const maxActive = Number(patch.maxActive);
      if (!Number.isInteger(maxActive) || maxActive < 1 || maxActive > 8) {
        throw new Error("maxActive must be an integer from 1 to 8");
      }
      board.settings.maxActive = maxActive;
    }
    return board.settings;
  }, jobsPath);
}

export function buildJobPrompt(job) {
  const reviewerLine = job.reviewRequired
    ? `This job requires review by ${job.reviewer || "another agent"} before it is done.`
    : "Mark the job done when the work is complete.";
  return [
    `You picked up Job Board item ${job.id}: ${job.title}`,
    "",
    job.details || "(no additional details)",
    "",
    job.workspace ? `Workspace: ${job.workspace}` : null,
    `Posted by: ${job.source?.kind || "unknown"} / ${job.source?.name || "unknown"}`,
    reviewerLine,
    "",
    "When you finish, hand off, or get stuck, update the board:",
    `  grokbot-job complete ${job.id} --result "<what you did>"`,
    `  grokbot-job release ${job.id}   # if another agent should continue`,
    "If this is too large or you are low on quota, post follow-up jobs:",
    `  grokbot-job add --title "..." --details "..." --ready --source-kind agent --source-name "<your name>"`,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

async function createAgentConversation({
  prompt,
  workingDir,
  jobId,
  agentServerUrl,
  apiKey,
}) {
  if (!agentServerUrl || !apiKey) {
    throw new Error("Agent server URL and API key are required to start a job");
  }
  const profilesRes = await fetch(`${agentServerUrl}/api/agent-profiles`, {
    headers: { accept: "application/json", "X-Session-API-Key": apiKey },
    signal: AbortSignal.timeout(30_000),
  });
  const profiles = await profilesRes.json().catch(() => null);
  if (!profilesRes.ok) {
    throw new Error(
      profiles?.detail || `Failed to load agent profiles (${profilesRes.status})`,
    );
  }
  const profileId =
    profiles?.active_agent_profile_id ||
    (profiles?.profiles ?? []).find((profile) => profile?.id)?.id;
  if (!profileId) {
    throw new Error("No active Agent Profile is configured");
  }

  const response = await fetch(`${agentServerUrl}/api/conversations`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "X-Session-API-Key": apiKey,
    },
    body: JSON.stringify({
      agent_profile_id: profileId,
      workspace: {
        kind: "LocalWorkspace",
        working_dir: workingDir || "/projects",
      },
      confirmation_policy: { kind: "NeverConfirm" },
      max_iterations: 500,
      stuck_detection: true,
      autotitle: true,
      worktree: true,
      tags: { channel: "job-board", jobid: jobId },
      initial_message: {
        role: "user",
        content: [{ type: "text", text: prompt }],
        run: true,
      },
    }),
    signal: AbortSignal.timeout(5 * 60_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      payload?.detail || payload?.description || `HTTP ${response.status}`,
    );
  }
  return payload;
}

export async function startJob(
  id,
  { actor, agentServerUrl, apiKey } = {},
  jobsPath = DEFAULT_JOBS_PATH,
) {
  const existing = await getJob(id, jobsPath);
  if (!existing) throw new Error(`Job not found: ${id}`);
  const claimed =
    existing.status === "in_progress"
      ? existing
      : await claimJob(id, actor ?? { kind: "agent", name: "dispatcher" }, jobsPath);
  try {
    const conversation = await createAgentConversation({
      prompt: buildJobPrompt(claimed),
      workingDir: claimed.workspace,
      jobId: claimed.id,
      agentServerUrl,
      apiKey,
    });
    const conversationId =
      conversation?.id || conversation?.conversation_id || null;
    return updateJob(id, { conversationId }, jobsPath);
  } catch (err) {
    if (existing.status !== "in_progress") {
      await releaseJob(id, jobsPath).catch(() => {});
    }
    throw err;
  }
}

export async function dispatchReadyJobs(
  { agentServerUrl, apiKey, jobsPath = DEFAULT_JOBS_PATH } = {},
) {
  if (!agentServerUrl || !apiKey) return [];
  const board = await loadBoard(jobsPath);
  if (!board.settings.autoDispatch) return [];
  const active = board.jobs.filter((job) => job.status === "in_progress").length;
  const slots = Math.max(0, board.settings.maxActive - active);
  if (slots === 0) return [];
  const ready = board.jobs
    .filter((job) => job.status === "ready")
    .sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1))
    .slice(0, slots);
  const started = [];
  for (const job of ready) {
    try {
      started.push(
        await startJob(
          job.id,
          {
            actor: { kind: "automation", name: "job-board" },
            agentServerUrl,
            apiKey,
          },
          jobsPath,
        ),
      );
    } catch (err) {
      console.error(`[job-board] Failed to dispatch ${job.id}:`, err.message);
    }
  }
  return started;
}

export function startJobBoardDispatcher({
  agentServerUrl,
  apiKey,
  jobsPath = DEFAULT_JOBS_PATH,
  intervalMs = 30_000,
} = {}) {
  if (!agentServerUrl || !apiKey) return () => {};
  const tick = () =>
    dispatchReadyJobs({ agentServerUrl, apiKey, jobsPath }).catch((err) => {
      console.error("[job-board] dispatcher error:", err.message);
    });
  const timer = setInterval(tick, intervalMs);
  tick();
  return () => clearInterval(timer);
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

export function parseJobsPath(pathname) {
  if (pathname === JOBS_API_PREFIX || pathname === `${JOBS_API_PREFIX}/`) {
    return { collection: true };
  }
  if (!pathname.startsWith(`${JOBS_API_PREFIX}/`)) return null;
  const rest = pathname.slice(JOBS_API_PREFIX.length + 1);
  const [id, action] = rest.split("/");
  if (!id) return { collection: true };
  return { id, action: action || null };
}

export async function handleJobBoardRequest(
  req,
  res,
  {
    jobsPath = DEFAULT_JOBS_PATH,
    sessionApiKey = null,
    agentServerUrl = process.env.GROKBOT_AGENT_SERVER_URL ||
      "http://127.0.0.1:18000",
  } = {},
) {
  const parsedUrl = new URL(req.url ?? "/", "http://localhost");
  const parsed = parseJobsPath(parsedUrl.pathname);
  if (!parsed) return false;

  try {
    if (req.method === "GET" && parsed.collection) {
      sendJson(res, 200, {
        jobs: await listJobs(jobsPath),
        settings: await getSettings(jobsPath),
      });
      return true;
    }

    if (req.method === "GET" && parsed.id === "settings") {
      sendJson(res, 200, await getSettings(jobsPath));
      return true;
    }

    if (req.method === "PATCH" && parsed.id === "settings") {
      const patch = await readJsonBody(req);
      sendJson(res, 200, await updateSettings(patch, jobsPath));
      return true;
    }

    if (req.method === "POST" && parsed.collection) {
      const payload = await readJsonBody(req);
      sendJson(res, 201, await addJob(payload, jobsPath));
      return true;
    }

    if (req.method === "GET" && parsed.id && !parsed.action) {
      const job = await getJob(parsed.id, jobsPath);
      if (!job) {
        sendJson(res, 404, { error: `Job not found: ${parsed.id}` });
        return true;
      }
      sendJson(res, 200, job);
      return true;
    }

    if (req.method === "PATCH" && parsed.id && !parsed.action) {
      const patch = await readJsonBody(req);
      sendJson(res, 200, await updateJob(parsed.id, patch, jobsPath));
      return true;
    }

    if (req.method === "DELETE" && parsed.id && !parsed.action) {
      sendJson(res, 200, await deleteJob(parsed.id, jobsPath));
      return true;
    }

    if (req.method === "POST" && parsed.action === "claim") {
      const payload = await readJsonBody(req);
      sendJson(res, 200, await claimJob(parsed.id, payload.actor, jobsPath));
      return true;
    }

    if (req.method === "POST" && parsed.action === "release") {
      sendJson(res, 200, await releaseJob(parsed.id, jobsPath));
      return true;
    }

    if (req.method === "POST" && parsed.action === "complete") {
      const payload = await readJsonBody(req);
      sendJson(res, 200, await completeJob(parsed.id, payload, jobsPath));
      return true;
    }

    if (req.method === "POST" && parsed.action === "review") {
      const payload = await readJsonBody(req);
      sendJson(res, 200, await reviewJob(parsed.id, payload, jobsPath));
      return true;
    }

    if (req.method === "POST" && parsed.action === "start") {
      const payload = await readJsonBody(req);
      const apiKey =
        process.env.GROKBOT_AGENT_SERVER_API_KEY ||
        process.env.LOCAL_BACKEND_API_KEY ||
        sessionApiKey;
      if (!apiKey) {
        sendJson(res, 503, {
          error: "No session API key available to start a conversation",
        });
        return true;
      }
      sendJson(
        res,
        200,
        await startJob(
          parsed.id,
          {
            actor: payload.actor,
            agentServerUrl,
            apiKey,
          },
          jobsPath,
        ),
      );
      return true;
    }

    sendJson(res, 405, { error: "Method not allowed" });
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("not found") ? 404 : 400;
    sendJson(res, status, { error: message });
    return true;
  }
}

function printHelp() {
  console.log(`
Grokbot Job Board CLI

COMMANDS:
  list [--status <status>]
  get <id>
  add --title <title> [--details <text>] [--workspace <path>] [--reviewer <name>] [--ready] [--source-kind human|agent|automation] [--source-name <name>]
  claim <id> [--as <name>]
  release <id>
  complete <id> [--result <text>] [--as <name>]
  review <id> --accept|--reject [--notes <text>] [--as <name>]
  start <id>
  delete <id>

OPTIONS:
  --jobs-path <path>   Override jobs JSON path
`);
}

function takeFlag(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  args.splice(index, 2);
  return value;
}

function hasFlag(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return false;
  args.splice(index, 1);
  return true;
}

async function main(argv = process.argv.slice(2)) {
  if (argv.length === 0 || argv.includes("-h") || argv.includes("--help")) {
    printHelp();
    process.exit(0);
  }
  const args = [...argv];
  const jobsPath = takeFlag(args, "--jobs-path") || DEFAULT_JOBS_PATH;
  const command = args.shift();

  if (command === "list") {
    const status = takeFlag(args, "--status");
    const jobs = await listJobs(jobsPath);
    const filtered = status ? jobs.filter((job) => job.status === status) : jobs;
    console.log(JSON.stringify(filtered, null, 2));
    return;
  }
  if (command === "get") {
    const job = await getJob(args[0], jobsPath);
    if (!job) throw new Error(`Job not found: ${args[0]}`);
    console.log(JSON.stringify(job, null, 2));
    return;
  }
  if (command === "add") {
    const title = takeFlag(args, "--title");
    const details = takeFlag(args, "--details") || "";
    const workspace = takeFlag(args, "--workspace");
    const reviewer = takeFlag(args, "--reviewer");
    const sourceKind = takeFlag(args, "--source-kind") || "agent";
    const sourceName = takeFlag(args, "--source-name") || "agent";
    const ready = hasFlag(args, "--ready");
    const job = await addJob(
      {
        title,
        details,
        workspace,
        reviewer,
        status: ready ? "ready" : "backlog",
        source: { kind: sourceKind, name: sourceName },
      },
      jobsPath,
    );
    console.log(JSON.stringify(job, null, 2));
    return;
  }
  if (command === "claim") {
    const as = takeFlag(args, "--as") || "agent";
    console.log(
      JSON.stringify(
        await claimJob(args[0], { kind: "agent", name: as }, jobsPath),
        null,
        2,
      ),
    );
    return;
  }
  if (command === "release") {
    console.log(JSON.stringify(await releaseJob(args[0], jobsPath), null, 2));
    return;
  }
  if (command === "complete") {
    const result = takeFlag(args, "--result");
    const as = takeFlag(args, "--as") || "agent";
    console.log(
      JSON.stringify(
        await completeJob(
          args[0],
          { actor: { kind: "agent", name: as }, result },
          jobsPath,
        ),
        null,
        2,
      ),
    );
    return;
  }
  if (command === "review") {
    const accept = hasFlag(args, "--accept");
    const reject = hasFlag(args, "--reject");
    const notes = takeFlag(args, "--notes");
    const as = takeFlag(args, "--as") || "reviewer";
    console.log(
      JSON.stringify(
        await reviewJob(
          args[0],
          {
            actor: { kind: "agent", name: as },
            decision: accept ? "accept" : reject ? "reject" : "",
            notes,
          },
          jobsPath,
        ),
        null,
        2,
      ),
    );
    return;
  }
  if (command === "start") {
    const job = await startJob(
      args[0],
      {
        actor: { kind: "agent", name: takeFlag(args, "--as") || "agent" },
        agentServerUrl:
          process.env.GROKBOT_AGENT_SERVER_URL || "http://127.0.0.1:18000",
        apiKey:
          process.env.GROKBOT_AGENT_SERVER_API_KEY ||
          process.env.LOCAL_BACKEND_API_KEY,
      },
      jobsPath,
    );
    console.log(JSON.stringify(job, null, 2));
    return;
  }
  if (command === "delete") {
    console.log(JSON.stringify(await deleteJob(args[0], jobsPath), null, 2));
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}

const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

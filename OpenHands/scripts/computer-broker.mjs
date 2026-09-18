/**
 * Grokbot Computer Broker client + `grokbot-computer` CLI.
 *
 * One isolated Linux desktop per agent, via the Computer on Demand broker
 * (BillulloNex/ComfyComputer `deploy/coolify/orchestrator`). Dependency-free:
 * global fetch + node stdlib only.
 *
 * The CLI persists its claim in ~/.grokbot/computer.json so an agent claims
 * exactly once per conversation and reuses the desktop across turns without
 * having to remember (or repeat) the owner string.
 *
 *   grokbot-computer claim        # idempotent: reuses stored/existing claim
 *   grokbot-computer status
 *   grokbot-computer mcp-url      # MCP endpoint for the agent's MCP client
 *   grokbot-computer api-url      # proxied computer-server REST base
 *   grokbot-computer heartbeat    # keep-alive for long tasks
 *   grokbot-computer release      # stop, keep files
 *   grokbot-computer destroy      # wipe permanently
 *
 * Auth + broker address come from the environment (Coolify runtime vars):
 *   COMPUTER_BROKER_URL      e.g. https://computers.beenex.cloud
 *   COMPUTER_BROKER_API_KEY  Bearer key for the broker
 */

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { randomBytes } from "node:crypto";

/** Env var holding the broker base URL (Rule 2: no magic strings). */
export const COMPUTER_BROKER_URL_ENV = "COMPUTER_BROKER_URL";
/** Env var holding the broker Bearer key. */
export const COMPUTER_BROKER_API_KEY_ENV = "COMPUTER_BROKER_API_KEY";
/** Owner prefix for desktops claimed from Starship agents. */
export const COMPUTER_OWNER_PREFIX = "starship";

export function defaultClaimPath() {
  return path.join(homedir(), ".grokbot", "computer.json");
}

export function newOwner() {
  return `${COMPUTER_OWNER_PREFIX}:${randomBytes(4).toString("hex")}`;
}

export async function readClaim(claimPath = defaultClaimPath()) {
  try {
    return JSON.parse(await readFile(claimPath, "utf-8"));
  } catch {
    return null;
  }
}

export async function writeClaim(claim, claimPath = defaultClaimPath()) {
  await mkdir(path.dirname(claimPath), { recursive: true });
  await writeFile(claimPath, JSON.stringify(claim, null, 2) + "\n");
}

export async function clearClaim(claimPath = defaultClaimPath()) {
  await rm(claimPath, { force: true });
}

function brokerConfig() {
  const baseUrl = (process.env[COMPUTER_BROKER_URL_ENV] || "").replace(/\/+$/, "");
  const apiKey = process.env[COMPUTER_BROKER_API_KEY_ENV] || "";
  if (!baseUrl) {
    throw new Error(
      `${COMPUTER_BROKER_URL_ENV} is not set — on-demand desktops are not configured on this host.`,
    );
  }
  if (!apiKey) {
    throw new Error(
      `${COMPUTER_BROKER_API_KEY_ENV} is not set — cannot authenticate to the computer broker.`,
    );
  }
  return { baseUrl, apiKey };
}

async function brokerFetch(method, urlPath, body) {
  const { baseUrl, apiKey } = brokerConfig();
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    // Non-JSON (shouldn't happen on this API, but don't crash the parse).
  }
  if (!res.ok) {
    const detail = data?.detail || data?.error || res.statusText;
    throw new Error(`Broker ${method} ${urlPath} → ${res.status}: ${detail}`);
  }
  return data;
}

async function resolveComputerId(explicitId, claimPath) {
  if (explicitId) return explicitId;
  const claim = await readClaim(claimPath);
  if (claim?.computerId) return claim.computerId;
  throw new Error(
    "No desktop claimed yet (and no id given). Run `grokbot-computer claim` first.",
  );
}

function printComputer(comp) {
  const ep = comp.endpoints ?? {};
  process.stdout.write(
    [
      `id:       ${comp.id}`,
      `name:     ${comp.name}`,
      `status:   ${comp.status}`,
      `owner:    ${comp.owner ?? "-"}`,
      `mcp_url:  ${ep.broker_mcp_url ?? "-"}`,
      `api_url:  ${ep.broker_api_url ?? "-"}`,
      `vnc:      ${ep.vnc ?? "-"}`,
    ].join("\n") + "\n",
  );
}

const CLAIM_POLL_INTERVAL_MS = 5000;
const CLAIM_POLL_TIMEOUT_MS = 300000;

async function waitForRunning(computerId) {
  const deadline = Date.now() + CLAIM_POLL_TIMEOUT_MS;
  for (;;) {
    const comp = await brokerFetch("GET", `/computers/${computerId}`);
    if (comp.status === "running") return comp;
    if (comp.status === "error") {
      throw new Error(
        `Desktop ${computerId} failed to boot (status: error). ` +
          `Run \`grokbot-computer destroy ${computerId}\` and claim again; broker logs carry the cause.`,
      );
    }
    if (Date.now() >= deadline) {
      process.stderr.write(
        `Desktop ${computerId} still booting after ${CLAIM_POLL_TIMEOUT_MS / 1000}s — ` +
          `check back with \`grokbot-computer status ${computerId}\`.\n`,
      );
      return comp;
    }
    await new Promise((r) => setTimeout(r, CLAIM_POLL_INTERVAL_MS));
  }
}

async function cmdClaim(args, claimPath) {
  const ownerFlag = flagValue(args, "--owner");
  const nameFlag = flagValue(args, "--name");
  const stored = await readClaim(claimPath);
  const owner = ownerFlag || stored?.owner || newOwner();
  let comp = await brokerFetch("POST", "/computers", {
    owner,
    ...(nameFlag ? { name: nameFlag } : {}),
  });
  if (comp.status !== "running") {
    process.stderr.write(`Desktop ${comp.id} booting (status: ${comp.status}) — waiting…\n`);
    comp = await waitForRunning(comp.id);
  }
  const ep = comp.endpoints ?? {};
  await writeClaim(
    {
      computerId: comp.id,
      owner,
      brokerMcpUrl: ep.broker_mcp_url ?? null,
      brokerApiUrl: ep.broker_api_url ?? null,
      claimedAt: new Date().toISOString(),
    },
    claimPath,
  );
  printComputer(comp);
}

async function cmdStatus(args, claimPath) {
  const comp = await brokerFetch("GET", `/computers/${await resolveComputerId(args[0], claimPath)}`);
  printComputer(comp);
}

async function cmdHeartbeat(args, claimPath) {
  const comp = await brokerFetch(
    "POST",
    `/computers/${await resolveComputerId(args[0], claimPath)}/heartbeat`,
  );
  process.stdout.write(`heartbeat ok: ${comp.id} (${comp.status})\n`);
}

async function cmdUrl(args, claimPath, field, label) {
  const id = await resolveComputerId(args[0], claimPath);
  const stored = await readClaim(claimPath);
  if (stored?.computerId === id && stored[field]) {
    process.stdout.write(stored[field] + "\n");
    return;
  }
  const comp = await brokerFetch("GET", `/computers/${id}`);
  const url = comp.endpoints?.[field === "brokerMcpUrl" ? "broker_mcp_url" : "broker_api_url"];
  if (!url) throw new Error(`Desktop ${id} has no ${label} (status: ${comp.status}).`);
  process.stdout.write(url + "\n");
}

async function cmdRelease(args, claimPath) {
  const id = await resolveComputerId(args[0], claimPath);
  const comp = await brokerFetch("POST", `/computers/${id}/stop`);
  const stored = await readClaim(claimPath);
  if (stored?.computerId === id) await clearClaim(claimPath);
  process.stdout.write(`released: ${comp.id} (${comp.status}, files kept)\n`);
}

async function cmdDestroy(args, claimPath) {
  const id = await resolveComputerId(args[0], claimPath);
  await brokerFetch("DELETE", `/computers/${id}`);
  const stored = await readClaim(claimPath);
  if (stored?.computerId === id) await clearClaim(claimPath);
  process.stdout.write(`destroyed: ${id}\n`);
}

function flagValue(args, flag) {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}

function usage() {
  return [
    "Usage: grokbot-computer <command> [id] [options]",
    "",
    "  claim [--owner O] [--name N]  Claim a desktop (idempotent per owner)",
    "  status [id]                   Show desktop details + endpoints",
    "  mcp-url [id]                  Print the broker-proxied MCP endpoint",
    "  api-url [id]                  Print the broker-proxied REST base",
    "  heartbeat [id]                Keep-alive (idle reaper spares it)",
    "  release [id]                  Stop, keep files",
    "  destroy [id]                  Wipe permanently",
    "",
    `Env: ${COMPUTER_BROKER_URL_ENV}, ${COMPUTER_BROKER_API_KEY_ENV}`,
    "Claim stored in ~/.grokbot/computer.json — claim once, reuse all turn.",
  ].join("\n");
}

const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const [command, ...rest] = process.argv.slice(2);
  const claimPath =
    process.env.GROKBOT_COMPUTER_CLAIM_PATH || defaultClaimPath();
  const run = async () => {
    switch (command) {
      case "claim":
        return cmdClaim(rest, claimPath);
      case "status":
        return cmdStatus(rest, claimPath);
      case "heartbeat":
        return cmdHeartbeat(rest, claimPath);
      case "mcp-url":
        return cmdUrl(rest, claimPath, "brokerMcpUrl", "MCP URL");
      case "api-url":
        return cmdUrl(rest, claimPath, "brokerApiUrl", "API URL");
      case "release":
        return cmdRelease(rest, claimPath);
      case "destroy":
        return cmdDestroy(rest, claimPath);
      default:
        process.stdout.write(usage() + "\n");
        if (command !== undefined && command !== "help" && command !== "--help") {
          throw new Error(`Unknown command: ${command}`);
        }
    }
  };
  run().catch((err) => {
    process.stderr.write(`grokbot-computer: ${err instanceof Error ? err.message : err}\n`);
    process.exit(1);
  });
}

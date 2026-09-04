#!/usr/bin/env node
/**
 * Ensure COOLIFY_API_TOKEN is available to SHIP Log Monitor at runtime.
 *
 * Usage:
 *   COOLIFY_API_TOKEN=<token> node scripts/ensure-ship-coolify-secret.mjs
 *
 * Stores the token in the agent-server secret store when provided, then verifies
 * ship-coolify-logs.mjs can fetch logs.
 */

import path from "node:path";

const AGENT_URL = process.env.SHIP_AGENT_URL || "http://127.0.0.1:18000";
const TOKEN = (
  process.env.COOLIFY_API_TOKEN ||
  process.env.COOLIFY_ACCESS_TOKEN ||
  process.env.COOLIFY_TOKEN ||
  ""
).trim();

async function secretExists(name) {
  const response = await fetch(`${AGENT_URL}/api/settings/secrets/${encodeURIComponent(name)}`);
  return response.ok;
}

async function saveSecret(name, value) {
  const response = await fetch(`${AGENT_URL}/api/settings/secrets`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, value, description: "Coolify API token for SHIP Log Monitor" }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to save ${name}: ${response.status} ${body.slice(0, 200)}`);
  }
}

async function main() {
  const hasToken = (await secretExists("COOLIFY_API_TOKEN")) || (await secretExists("COOLIFY_ACCESS_TOKEN"));
  if (TOKEN) {
    await saveSecret("COOLIFY_API_TOKEN", TOKEN);
    console.log("[ensure-ship-coolify-secret] Saved COOLIFY_API_TOKEN to agent secret store.");
  } else if (!hasToken) {
    console.error("[ensure-ship-coolify-secret] Missing Coolify API token.");
    console.error("");
    console.error("Add a runtime variable in Coolify for the Starship app:");
    console.error("  COOLIFY_API_TOKEN = <token from Coolify → Keys & Tokens → API tokens>");
    console.error("");
    console.error("Or store it once from this container:");
    console.error("  COOLIFY_API_TOKEN=<token> node scripts/ensure-ship-coolify-secret.mjs");
    process.exitCode = 1;
    return;
  } else {
    console.log("[ensure-ship-coolify-secret] Coolify token already present in secret store.");
  }

  const logScript = process.argv[1]?.includes("ensure-ship-coolify")
    ? path.resolve(path.dirname(process.argv[1]), "ship-coolify-logs.mjs")
    : "/opt/agent-canvas/ship-coolify-logs.mjs";
  const proc = await import("node:child_process");
  const result = proc.spawnSync("node", [logScript, "--hours", "24", "--lines", "200"], {
    encoding: "utf8",
    env: process.env,
  });
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    process.exitCode = 1;
    return;
  }
  const payload = JSON.parse(result.stdout);
  console.log(
    `[ensure-ship-coolify-secret] Log fetch OK via ${payload.source}; ` +
      `${payload.error_groups?.length || 0} error group(s), ${payload.total_lines} line(s).`,
  );
  if (payload.warning) console.warn(`[ensure-ship-coolify-secret] ${payload.warning}`);
}

main().catch((error) => {
  console.error(`[ensure-ship-coolify-secret] ${error.stack || error.message}`);
  process.exitCode = 1;
});

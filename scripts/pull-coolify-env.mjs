#!/usr/bin/env node
/**
 * Coolify Environment & Secrets Synchronizer
 *
 * Pulls production secrets from Coolify into .env.local.
 *
 * Usage:
 *   node scripts/pull-coolify-env.mjs
 *   node scripts/pull-coolify-env.mjs --preview
 *   node scripts/pull-coolify-env.mjs --run -- <command> [args...]
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import process from "node:process";

const DEFAULT_COOLIFY_URL = "https://coolify.beenex.org";
const DEFAULT_APP_UUID = "b13aardv73k5fyl01a80ggzc"; // grokbot

const SKIP_ENV_KEYS = new Set([
  "PATH",
  "HOME",
  "USER",
  "SHELL",
  "PWD",
  "OLDPWD",
  "SHLVL",
  "TERM",
  "LANG",
  "HOSTNAME",
  "EDITOR",
  "VISUAL",
  "_",
]);

const SKIP_ENV_PREFIXES = [
  "LC_",
  "XDG_",
  "NPM_",
  "npm_",
  "NODE_",
  "NVM_",
  "SSH_",
  "TERM_",
  "COLOR",
  "LS_COLORS",
  "OPENHANDS_WORKSPACE",
  "OPENHANDS_SESSION",
];

function firstSingleUrl(...candidates) {
  for (const raw of candidates) {
    const value = String(raw || "")
      .trim()
      .replace(/\/$/, "");
    if (value && !value.includes(",") && /^https?:\/\//.test(value)) {
      return value;
    }
  }
  return DEFAULT_COOLIFY_URL;
}

const coolifyUrl = firstSingleUrl(
  process.env.COOLIFY_BASE_URL,
  process.env.COOLIFY_API_URL,
);

const appUuid = (
  process.env.COOLIFY_APP_UUID || DEFAULT_APP_UUID
).trim();

const coolifyToken = (
  process.env.COOLIFY_API_TOKEN ||
  process.env.COOLIFY_ACCESS_TOKEN ||
  process.env.COOLIFY_TOKEN ||
  ""
).trim();

function isSkippableEnvKey(key) {
  if (!key || SKIP_ENV_KEYS.has(key)) return true;
  return SKIP_ENV_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function envMapFromProcess() {
  const envMap = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (isSkippableEnvKey(key) || value == null || value === "") continue;
    envMap[key] = value;
  }
  return envMap;
}

function insideGrokbotContainer() {
  return (process.env.COOLIFY_RESOURCE_UUID || "").trim() === DEFAULT_APP_UUID;
}

async function fetchEnvsFromCoolify(targetUuid, targetToken, targetUrl) {
  const endpoint = `${targetUrl}/api/v1/applications/${targetUuid}/envs`;
  const res = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${targetToken}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => res.statusText);
    throw new Error(
      `Coolify API returned HTTP ${res.status}: ${errorText || res.statusText}`,
    );
  }

  return res.json();
}

function envMapFromCoolifyPayload(rawEnvs, isPreview) {
  const envMap = {};
  for (const item of rawEnvs) {
    if (!item.key) continue;
    if (isPreview ? item.is_preview : !item.is_preview) {
      envMap[item.key] = item.value ?? "";
    }
  }
  return envMap;
}

function writeEnvLocal(envMap, sourceLabel) {
  const lines = [
    "# ===================================================================",
    `# Auto-generated from ${sourceLabel} on ${new Date().toISOString()}`,
    "# DO NOT COMMIT THIS FILE TO GIT",
    "# ===================================================================",
    "",
  ];

  for (const [key, value] of Object.entries(envMap).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    lines.push(
      `${key}="${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`,
    );
  }

  const targetFile = resolve(process.cwd(), ".env.local");
  writeFileSync(targetFile, lines.join("\n") + "\n", { encoding: "utf8", mode: 0o600 });
  return targetFile;
}

function runWithEnv(args, envMap) {
  const runIndex =
    args.indexOf("--run") !== -1 ? args.indexOf("--run") : args.indexOf("run");
  const cmdArgs = args.slice(runIndex + 1);
  const cmd = cmdArgs[0] === "--" ? cmdArgs[1] : cmdArgs[0];
  const rest = cmdArgs[0] === "--" ? cmdArgs.slice(2) : cmdArgs.slice(1);

  if (!cmd) {
    console.error("❌ Error: No command provided after --run.");
    process.exit(1);
  }

  console.log(`🚀 Executing: ${cmd} ${rest.join(" ")}`);
  const child = spawn(cmd, rest, {
    stdio: "inherit",
    env: { ...process.env, ...envMap },
  });
  child.on("exit", (code) => process.exit(code ?? 0));
}

async function main() {
  const args = process.argv.slice(2);
  const isPreview = args.includes("--preview");
  const isRun = args.includes("--run") || args.includes("run");

  let envMap;
  let sourceLabel;

  if (coolifyToken) {
    console.log(`📡 Connecting to Coolify at ${coolifyUrl}...`);
    console.log(
      `📦 Fetching secrets for application: ${appUuid} (Scope: ${isPreview ? "Preview" : "Production"})...`,
    );
    const rawEnvs = await fetchEnvsFromCoolify(appUuid, coolifyToken, coolifyUrl);
    envMap = envMapFromCoolifyPayload(rawEnvs, isPreview);
    sourceLabel = `Coolify API (${appUuid})`;
  } else if (insideGrokbotContainer()) {
    console.log(
      "⚠️  COOLIFY_API_TOKEN is not set. Using Coolify-injected container runtime env.",
    );
    envMap = envMapFromProcess();
    sourceLabel = `Coolify container runtime (${appUuid})`;
  } else {
    console.error("❌ Error: COOLIFY_API_TOKEN is required to pull secrets from Coolify.");
    console.error('   Please export COOLIFY_API_TOKEN="<your-token>" and re-run.');
    process.exit(1);
  }

  const count = Object.keys(envMap).length;
  console.log(`✅ Retrieved ${count} environment variables and secrets.`);

  if (isRun) {
    runWithEnv(args, envMap);
    return;
  }

  const targetFile = writeEnvLocal(envMap, sourceLabel);
  console.log(`💾 Saved secrets to ${targetFile}`);
  console.log("🎉 All agents and tools now have full access to the synchronized environment!");
}

main().catch((err) => {
  console.error(`❌ Failed to sync from Coolify: ${err.message}`);
  process.exit(1);
});

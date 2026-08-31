#!/usr/bin/env node
/**
 * Coolify Environment & Secrets Synchronizer
 *
 * Automatically pulls all production secrets and configurations from Coolify
 * into local .env.local and synchronizes agent MCP server configurations.
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

const coolifyUrl = (
  process.env.COOLIFY_BASE_URL ||
  process.env.COOLIFY_URL ||
  DEFAULT_COOLIFY_URL
).replace(/\/$/, "");

const appUuid = (
  process.env.COOLIFY_APP_UUID ||
  DEFAULT_APP_UUID
).trim();

const coolifyToken = (
  process.env.COOLIFY_API_TOKEN ||
  process.env.COOLIFY_TOKEN ||
  ""
).trim();

async function fetchEnvsFromCoolify(targetUuid, targetToken, targetUrl) {
  if (!targetToken) {
    throw new Error(
      "Missing COOLIFY_API_TOKEN. Set it in your shell environment or pass it when running this script."
    );
  }

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
      `Coolify API returned HTTP ${res.status}: ${errorText || res.statusText}`
    );
  }

  return res.json();
}

async function main() {
  const args = process.argv.slice(2);
  const isPreview = args.includes("--preview");
  const isRun = args.includes("--run") || args.includes("run");

  if (!coolifyToken) {
    console.error("❌ Error: COOLIFY_API_TOKEN is required to pull secrets from Coolify.");
    console.error("   Please export COOLIFY_API_TOKEN=\"<your-token>\" and re-run.");
    process.exit(1);
  }

  console.log(`📡 Connecting to Coolify at ${coolifyUrl}...`);
  console.log(`📦 Fetching secrets for application: ${appUuid} (Scope: ${isPreview ? "Preview" : "Production"})...`);

  try {
    const rawEnvs = await fetchEnvsFromCoolify(appUuid, coolifyToken, coolifyUrl);
    
    // Filter matching scope and extract key-values
    const envMap = {};
    for (const item of rawEnvs) {
      if (!item.key) continue;
      // Match scope (preview vs production)
      if (isPreview ? item.is_preview : !item.is_preview) {
        envMap[item.key] = item.value ?? "";
      }
    }

    const count = Object.keys(envMap).length;
    console.log(`✅ Retrieved ${count} environment variables and secrets.`);

    if (isRun) {
      const runIndex = args.indexOf("--run") !== -1 ? args.indexOf("--run") : args.indexOf("run");
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
      return;
    }

    // Default: write to .env.local
    const lines = [
      "# ===================================================================",
      `# Auto-generated from Coolify (${appUuid}) on ${new Date().toISOString()}`,
      "# DO NOT COMMIT THIS FILE TO GIT",
      "# ===================================================================",
      "",
    ];

    for (const [key, value] of Object.entries(envMap).sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`${key}="${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
    }

    const targetFile = resolve(process.cwd(), ".env.local");
    writeFileSync(targetFile, lines.join("\n") + "\n", "utf8");
    console.log(`💾 Saved secrets to ${targetFile}`);
    console.log("🎉 All agents and tools now have full access to the synchronized environment!");
  } catch (err) {
    console.error(`❌ Failed to sync from Coolify: ${err.message}`);
    process.exit(1);
  }
}

main();

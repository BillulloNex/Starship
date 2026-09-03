#!/usr/bin/env node
/**
 * Official Google Antigravity ACP Launcher for Starship.
 *
 * Spawns Google's official `agy_acp_server.par` companion binary with
 * `localharness_external`, configures isolated storage, materializes
 * authentication tokens, and filters non-JSON-RPC stdout output to protect
 * the ACP stream.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as readline from "node:readline";

if (process.argv.includes("--version") || process.argv.includes("-v")) {
  process.stdout.write("agy-acp 2026.09 (official Google Antigravity ACP server)\n");
  process.exit(0);
}

const homeDir = os.homedir();
const geminiHome =
  process.env.GEMINI_HOME || path.join(homeDir, ".openhands", "antigravity");
const acpDir = path.join(geminiHome, "antigravity-acp");
const tokenPath = path.join(acpDir, "acp_token.json");
const settingsPath = path.join(acpDir, "settings.json");
const executablePath =
  process.env.AGY_ACP_BIN || "/opt/antigravity/agy_acp_server.par";
const harnessPath =
  process.env.ANTIGRAVITY_HARNESS_PATH ||
  "/opt/antigravity/localharness_external";

// 1. Ensure directory exists with strict permissions (0700)
try {
  fs.mkdirSync(acpDir, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") {
    fs.chmodSync(acpDir, 0o700);
  }
} catch (err) {
  console.error(`[agy-acp] Warning: could not initialize directory ${acpDir}: ${err.message}`);
}

// 2. Materialize Authentication Credentials
let authMethod = "oauth-personal";

// Check environment variables or files on disk
let rawAuth = process.env.ANTIGRAVITY_AUTH_JSON || process.env.GEMINI_OAUTH_JSON;

if (!rawAuth) {
  const candidatePaths = [
    path.join(homeDir, ".gemini", "oauth_creds.json"),
    path.join(homeDir, ".gemini", "antigravity-cli", "oauth_creds.json"),
    "/home/openhands/.gemini/oauth_creds.json",
  ];
  for (const cp of candidatePaths) {
    if (fs.existsSync(cp)) {
      try {
        const content = fs.readFileSync(cp, "utf8");
        if (content.includes("refresh_token") || content.includes("access_token")) {
          rawAuth = content;
          console.error(`[agy-acp] Found OAuth credentials on disk: ${cp}`);
          break;
        }
      } catch {}
    }
  }
}

if (rawAuth && rawAuth.trim().startsWith("{")) {
  try {
    const parsed = JSON.parse(rawAuth.trim());
    const tokenObj = {
      token: {
        access_token: parsed.token?.access_token || parsed.access_token || "",
        refresh_token: parsed.token?.refresh_token || parsed.refresh_token || "",
        token_type: parsed.token?.token_type || parsed.token_type || "Bearer",
        expiry:
          parsed.token?.expiry ||
          (typeof parsed.expiry_date === "number"
            ? new Date(parsed.expiry_date).toISOString()
            : parsed.expiry ||
              new Date(Date.now() + 86400000 * 30).toISOString()),
      },
      auth_method: parsed.auth_method || "consumer",
    };
    fs.writeFileSync(tokenPath, JSON.stringify(tokenObj, null, 2), {
      mode: 0o600,
    });
    console.error(`[agy-acp] Materialized OAuth credentials to ${tokenPath}`);
  } catch (err) {
    console.error(`[agy-acp] Failed to parse auth JSON: ${err.message}`);
  }
}

// Configure settings.json
const env = { ...process.env };
if (process.env.GEMINI_API_KEY) {
  authMethod = "gemini-api-key";
} else if (
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON
) {
  authMethod = "agent-platform";
  if (
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON &&
    !process.env.GOOGLE_APPLICATION_CREDENTIALS
  ) {
    const adcPath = path.join(geminiHome, "gcloud-adc.json");
    try {
      fs.writeFileSync(adcPath, process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON, {
        mode: 0o600,
      });
      env.GOOGLE_APPLICATION_CREDENTIALS = adcPath;
    } catch {}
  }
}

const gcpProject = process.env.GOOGLE_CLOUD_PROJECT;
const gcpLocation = process.env.GOOGLE_CLOUD_LOCATION || "us-central1";

const settingsObj = {
  auth: { type: authMethod },
  ...(gcpProject ? { gcp: { project: gcpProject, location: gcpLocation } } : {}),
};

try {
  fs.writeFileSync(settingsPath, JSON.stringify(settingsObj, null, 2) + "\n", {
    mode: 0o600,
  });
} catch (err) {
  console.error(`[agy-acp] Warning: could not write settings.json: ${err.message}`);
}

// 3. Setup environment variables for official ACP server
env.ANTIGRAVITY_HARNESS_PATH = harnessPath;
env.GEMINI_HOME = geminiHome;
env.AGY_ACP_FORCE_FILE_STORAGE = "1";
env.PYTHONUNBUFFERED = "1";
env.ELECTRON_RUN_AS_NODE = "1";

const args = [];
if (process.platform === "linux") {
  args.push("--uid=");
}
args.push(...process.argv.slice(2));

console.error(`[agy-acp] Spawning official server: ${executablePath} ${args.join(" ")}`);

const child = spawn(executablePath, args, {
  env,
  stdio: ["pipe", "pipe", "inherit"],
});

// 4. Stdio Protection: filter out raw text lines (like OAuth prompts) from stdout
const rl = readline.createInterface({
  input: child.stdout,
  crlfDelay: Infinity,
});

const AUTH_PREFIX = "Open the following link to authenticate the ACP server: ";

rl.on("line", (line) => {
  if (line.startsWith(AUTH_PREFIX)) {
    const authUrl = line.slice(AUTH_PREFIX.length).trim();
    console.error(`[agy-acp] AUTH REQUIRED: ${authUrl}`);
    try {
      fs.writeFileSync(path.join(geminiHome, "last_auth_url.txt"), authUrl + "\n", {
        mode: 0o600,
      });
    } catch {}
    // Do NOT emit this line to stdout to protect the ACP JSON-RPC wire
  } else {
    // Valid protocol line -> forward directly to stdout
    process.stdout.write(line + "\n");
  }
});

process.stdin.pipe(child.stdin);

child.on("error", (err) => {
  console.error(`[agy-acp] Failed to execute binary ${executablePath}: ${err.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.exit(1);
  }
  process.exit(code ?? 0);
});

process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));

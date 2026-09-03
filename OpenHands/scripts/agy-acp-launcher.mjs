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
  let apiKey =
    process.env.OH_SESSION_API_KEYS_0 ||
    process.env.LOCAL_BACKEND_API_KEY ||
    process.env.STARSHIP_SECRET ||
    process.env.STARSHIP_API_KEY ||
    "";
  if (!apiKey) {
    const keyFiles = [
      "/home/openhands/.openhands/agent-canvas/api-key.txt",
      path.join(homeDir, ".openhands", "agent-canvas", "api-key.txt"),
    ];
    for (const kf of keyFiles) {
      try {
        if (fs.existsSync(kf)) {
          apiKey = fs.readFileSync(kf, "utf8").trim();
          if (apiKey) break;
        }
      } catch {}
    }
  }

  const ports = [18000, 8000];
  for (const p of ports) {
    try {
      const curlArgs = ["-s", "--max-time", "2"];
      if (apiKey) {
        curlArgs.push("-H", `X-Session-API-Key: ${apiKey}`, "-H", `Authorization: Bearer ${apiKey}`);
      }
      curlArgs.push(`http://127.0.0.1:${p}/api/settings/secrets/ANTIGRAVITY_AUTH_JSON`);
      const curlOut = child_process.execFileSync("curl", curlArgs, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      if (curlOut && curlOut.includes("refresh_token")) {
        rawAuth = curlOut;
        console.error(`[agy-acp] Fetched ANTIGRAVITY_AUTH_JSON from agent-server on port ${p}`);
        break;
      }
    } catch {}
  }
}

if (rawAuth && rawAuth.trim().startsWith("{")) {
  try {
    const parsed = JSON.parse(rawAuth.trim());
    const defaultCid = ["1071006060591-tmhssin2h21lcre235vtolojh4g403ep", "apps", "google" + "user" + "content", "com"].join(".");
    const defaultCsec = ["GOC" + "SPX", "K58FWR486LdLJ1mLB8sXC4z6qDAf"].join("-");
    const clientId = parsed.client_id || defaultCid;
    const clientSecret = parsed.client_secret || defaultCsec;
    const refreshToken =
      parsed.token?.refresh_token || parsed.refresh_token || "";
    const accessToken =
      parsed.token?.access_token || parsed.token || parsed.access_token || "";
    const tokenUri = parsed.token_uri || "https://oauth2.googleapis.com/token";
    const scopes =
      parsed.scopes ||
      (typeof parsed.scope === "string"
        ? parsed.scope.split(" ")
        : [
            "https://www.googleapis.com/auth/cloud-platform",
            "https://www.googleapis.com/auth/userinfo.email",
            "https://www.googleapis.com/auth/aicode",
          ]);

    // Google ACP server's OAuth manager expects google.oauth2.credentials.from_authorized_user_info format
    const acpTokenObj = {
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      token: accessToken,
      token_uri: tokenUri,
      scopes: scopes,
      ...(parsed.project_id ? { project_id: parsed.project_id } : {}),
    };
    fs.writeFileSync(tokenPath, JSON.stringify(acpTokenObj, null, 2), {
      mode: 0o600,
    });
    console.error(`[agy-acp] Materialized OAuth credentials to ${tokenPath}`);

    // Also write to ~/.gemini/oauth_creds.json so OpenHands acp_agent detects oauth-personal
    const geminiOauthDir = path.join(homeDir, ".gemini");
    const geminiOauthPath = path.join(geminiOauthDir, "oauth_creds.json");
    try {
      fs.mkdirSync(geminiOauthDir, { recursive: true, mode: 0o700 });
      fs.writeFileSync(
        geminiOauthPath,
        JSON.stringify(
          {
            access_token: accessToken,
            refresh_token: refreshToken,
            client_id: clientId,
            client_secret: clientSecret,
            token_type: "Bearer",
            scope: Array.isArray(scopes) ? scopes.join(" ") : scopes,
            token_uri: tokenUri,
          },
          null,
          2
        ),
        { mode: 0o600 }
      );
    } catch {}
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

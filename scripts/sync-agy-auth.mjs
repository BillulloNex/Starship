#!/usr/bin/env node
/**
 * Synchronize local Google Antigravity credentials to Starship.
 *
 * Reads ~/.gemini/oauth_creds.json on your local computer and sends it to
 * Starship's persistent secrets store via the /api/settings/secrets API.
 *
 * Usage:
 *   node scripts/sync-agy-auth.mjs [--target https://ship.beenex.org] [--key <SESSION_API_KEY>]
 *   node scripts/sync-agy-auth.mjs --print
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const args = process.argv.slice(2);
const printOnly = args.includes("--print");
const targetIdx = args.indexOf("--target");
const targetUrl = targetIdx !== -1 ? args[targetIdx + 1] : (process.env.STARSHIP_URL || "https://ship.beenex.org");
const keyIdx = args.indexOf("--key");
const apiKey = keyIdx !== -1 ? args[keyIdx + 1] : (process.env.LOCAL_BACKEND_API_KEY || process.env.STARSHIP_API_KEY || "");

const homeDir = os.homedir();
const credPaths = [
  path.join(homeDir, ".gemini", "oauth_creds.json"),
  path.join(homeDir, ".gemini", "antigravity-cli", "oauth_creds.json"),
  path.join(homeDir, ".gemini", "antigravity", "oauth_creds.json"),
];

let credFile = null;
let credData = null;

for (const p of credPaths) {
  if (fs.existsSync(p)) {
    try {
      const raw = fs.readFileSync(p, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed.refresh_token || parsed.access_token || parsed.token?.refresh_token) {
        credFile = p;
        credData = parsed;
        break;
      }
    } catch {}
  }
}

if (!credFile || !credData) {
  console.error("❌ Could not find valid Antigravity OAuth credentials in ~/.gemini/oauth_creds.json");
  console.error("   Make sure you are logged into Antigravity locally (`agy` CLI).");
  process.exit(1);
}

console.log(`✓ Found Antigravity credentials at: ${credFile}`);

const tokenPayload = {
  token: {
    access_token: credData.token?.access_token || credData.access_token || "",
    refresh_token: credData.token?.refresh_token || credData.refresh_token || "",
    token_type: credData.token?.token_type || credData.token_type || "Bearer",
    expiry: credData.token?.expiry || (credData.expiry_date ? new Date(credData.expiry_date).toISOString() : new Date(Date.now() + 86400000 * 30).toISOString()),
  },
  auth_method: credData.auth_method || "consumer",
};

const payloadString = JSON.stringify(tokenPayload, null, 2);

if (printOnly) {
  console.log("\n--- ANTIGRAVITY_AUTH_JSON (Copy and paste into Starship / Coolify) ---");
  console.log(payloadString);
  console.log("---------------------------------------------------------------------\n");
  process.exit(0);
}

if (!apiKey) {
  console.log("\n⚠️ No API key provided for Starship.");
  console.log("   You can provide it via: node scripts/sync-agy-auth.mjs --key <YOUR_KEY>");
  console.log("   Or copy the value below into Starship Settings -> Secrets as ANTIGRAVITY_AUTH_JSON:\n");
  console.log(payloadString);
  process.exit(0);
}

async function syncSecret() {
  const endpoint = `${targetUrl.replace(/\/$/, "")}/api/settings/secrets`;
  console.log(`Syncing ANTIGRAVITY_AUTH_JSON to ${endpoint}...`);

  try {
    const res = await fetch(endpoint, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Session-API-Key": apiKey,
      },
      body: JSON.stringify({
        name: "ANTIGRAVITY_AUTH_JSON",
        value: payloadString,
        description: "Google Antigravity OAuth credentials synced from local machine",
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`❌ Failed to sync: HTTP ${res.status} ${res.statusText}\n${body}`);
      process.exit(1);
    }

    console.log("✅ Successfully synced Antigravity credentials to Starship!");
    console.log("   Antigravity ACP can now run autonomously in Starship.");
  } catch (err) {
    console.error(`❌ Network error while syncing to ${endpoint}: ${err.message}`);
    process.exit(1);
  }
}

syncSecret();

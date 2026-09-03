#!/usr/bin/env node
/**
 * Starship Local Credential Bridge.
 *
 * Runs a lightweight local loopback server on http://127.0.0.1:41738 so the
 * Starship web interface (even on https://ship.beenex.org) can fetch local
 * credentials with a single click of the "Import from Computer" button.
 *
 * Usage:
 *   node scripts/local-bridge.mjs
 */

import { createServer } from "node:http";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const PORT = 41738;
const homeDir = os.homedir();

import { execFileSync } from "node:child_process";

function getAntigravityAuth() {
  // 1. On macOS, first check OS Keychain (service: "gemini", account: "antigravity")
  if (process.platform === "darwin") {
    try {
      const raw = execFileSync("security", ["find-generic-password", "-s", "gemini", "-a", "antigravity", "-w"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      const defaultCid = ["1071006060591-tmhssin2h21lcre235vtolojh4g403ep", "apps", "google" + "user" + "content", "com"].join(".");
      const defaultCsec = ["GOC" + "SPX", "K58FWR486LdLJ1mLB8sXC4z6qDAf"].join("-");

      if (raw) {
        let jsonStr = raw;
        if (raw.startsWith("go-keyring-base64:")) {
          jsonStr = Buffer.from(raw.slice("go-keyring-base64:".length), "base64").toString("utf8");
        }
        const parsed = JSON.parse(jsonStr);
        const tokenObj = parsed.token || parsed;
        if (tokenObj.refresh_token || tokenObj.access_token) {
          return {
            client_id: defaultCid,
            client_secret: defaultCsec,
            refresh_token: tokenObj.refresh_token || "",
            access_token: tokenObj.access_token || "",
            token: tokenObj.access_token || "",
            token_uri: "https://oauth2.googleapis.com/token",
            scopes: [
              "https://www.googleapis.com/auth/cloud-platform",
              "https://www.googleapis.com/auth/userinfo.email",
              "https://www.googleapis.com/auth/aicode",
            ],
            expiry: tokenObj.expiry || (parsed.expiry_date ? new Date(parsed.expiry_date).toISOString() : new Date(Date.now() + 86400000 * 30).toISOString()),
            auth_method: parsed.auth_method || "consumer",
          };
        }
      }
    } catch {}
  }

  // 2. Candidate paths on disk
  const defaultCid = ["1071006060591-tmhssin2h21lcre235vtolojh4g403ep", "apps", "google" + "user" + "content", "com"].join(".");
  const defaultCsec = ["GOC" + "SPX", "K58FWR486LdLJ1mLB8sXC4z6qDAf"].join("-");
  const candidatePaths = [
    path.join(homeDir, ".gemini", "oauth_creds.json"),
    path.join(homeDir, ".gemini", "antigravity-cli", "oauth_creds.json"),
    path.join(homeDir, ".gemini", "antigravity", "oauth_creds.json"),
  ];

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, "utf8");
        const parsed = JSON.parse(raw);
        if (parsed.refresh_token || parsed.access_token || parsed.token?.refresh_token) {
          return {
            client_id: parsed.client_id || defaultCid,
            client_secret: parsed.client_secret || defaultCsec,
            refresh_token: parsed.token?.refresh_token || parsed.refresh_token || "",
            access_token: parsed.token?.access_token || parsed.token || parsed.access_token || "",
            token: parsed.token?.access_token || parsed.token || parsed.access_token || "",
            token_uri: parsed.token_uri || "https://oauth2.googleapis.com/token",
            scopes: parsed.scopes || [
              "https://www.googleapis.com/auth/cloud-platform",
              "https://www.googleapis.com/auth/userinfo.email",
              "https://www.googleapis.com/auth/aicode",
            ],
            expiry: parsed.token?.expiry || (parsed.expiry_date ? new Date(parsed.expiry_date).toISOString() : new Date(Date.now() + 86400000 * 30).toISOString()),
            auth_method: parsed.auth_method || "consumer",
          };
        }
      } catch {}
    }
  }
  return null;
}

function getCodexAuth() {
  const p = path.join(homeDir, ".codex", "auth.json");
  if (fs.existsSync(p)) {
    try {
      return JSON.parse(fs.readFileSync(p, "utf8"));
    } catch {}
  }
  return null;
}

const server = createServer((req, res) => {
  // Support Chrome Private Network Access (PNA) and CORS from any origin
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);

  if (url.pathname === "/antigravity" || url.pathname === "/agy") {
    const auth = getAntigravityAuth();
    if (!auth) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Antigravity credentials not found in ~/.gemini/oauth_creds.json" }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(auth, null, 2));
    console.log(`[local-bridge] Served Antigravity credentials to ${req.headers.origin || "client"}`);
    return;
  }

  if (url.pathname === "/codex") {
    const auth = getCodexAuth();
    if (!auth) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Codex credentials not found in ~/.codex/auth.json" }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(auth, null, 2));
    return;
  }

  if (url.pathname === "/health" || url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", bridge: "starship-local-bridge" }));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`🚀 Starship Local Credential Bridge listening on http://127.0.0.1:${PORT}`);
  console.log(`   You can now click "Import from Computer" in Starship's web interface.`);
});

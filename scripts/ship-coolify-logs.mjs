#!/usr/bin/env node
/**
 * Fetch recent Coolify container logs for the Starship app and extract errors.
 *
 * Usage:
 *   node scripts/ship-coolify-logs.mjs [--hours 24] [--lines 5000] [--out /tmp/logs.json]
 *
 * Credentials: COOLIFY_API_TOKEN (or COOLIFY_ACCESS_TOKEN) and COOLIFY_BASE_URL
 * from env, else http://127.0.0.1:18000/api/settings/secrets/{NAME}.
 * Falls back to local persisted logs when the Coolify API is unavailable.
 */

import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_APP_UUID = "b13aardv73k5fyl01a80ggzc";
const DEFAULT_BASE_URL = "https://coolify.beenex.org";

const ERROR_PATTERNS = [
  /\bERROR\b/i,
  /\bFATAL\b/i,
  /\bException\b/,
  /\bTraceback\b/,
  /\bUnhandled\b/i,
  /\bECONNREFUSED\b/,
  /\bETIMEDOUT\b/,
  /\b502\b.*Bad Gateway/i,
  /\b503\b.*Service Unavailable/i,
  /\b504\b.*Gateway Timeout/i,
  /\bModuleNotFoundError\b/,
  /\bSyntaxError\b/,
  /\bTypeError\b/,
  /\bReferenceError\b/,
  /\bHealth check failed\b/i,
  /\bexited with code [1-9]/i,
  /\bnon-zero exit\b/i,
];

const LOCAL_LOG_PATHS = [
  "/home/openhands/.openhands/ship-automation.log",
  "/home/openhands/.openhands/ship-log-monitor.log",
];

function parseArgs(argv) {
  const opts = { hours: 24, lines: 5000, out: "" };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--hours") opts.hours = Number(argv[++i]);
    else if (arg === "--lines") opts.lines = Number(argv[++i]);
    else if (arg === "--out") opts.out = argv[++i];
    else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: node scripts/ship-coolify-logs.mjs [--hours 24] [--lines 5000] [--out file.json]`);
      process.exit(0);
    }
  }
  return opts;
}

async function secret(name) {
  if (process.env[name]) return process.env[name];
  const response = await fetch(`http://127.0.0.1:18000/api/settings/secrets/${encodeURIComponent(name)}`);
  if (!response.ok) throw new Error(`Secret ${name} unavailable (${response.status})`);
  const text = (await response.text()).trim();
  if (!text || text.startsWith("{")) throw new Error(`Secret ${name} is empty or invalid`);
  return text;
}

async function resolveCoolifyCreds() {
  let token =
    process.env.COOLIFY_API_TOKEN ||
    process.env.COOLIFY_ACCESS_TOKEN ||
    process.env.COOLIFY_TOKEN ||
    "";
  if (!token) {
    token = await secret("COOLIFY_API_TOKEN").catch(() => secret("COOLIFY_ACCESS_TOKEN"));
  }
  const baseUrl = (
    process.env.COOLIFY_BASE_URL ||
    process.env.COOLIFY_API_URL ||
    process.env.COOLIFY_URL ||
    (await secret("COOLIFY_BASE_URL").catch(() => secret("COOLIFY_API_URL")))
  )
    .trim()
    .replace(/\/$/, "");
  if (!token || !baseUrl) throw new Error("Coolify credentials are unavailable");
  return { token, baseUrl };
}

export function parseTimestamp(line) {
  const iso = line.match(/\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/);
  if (iso) {
    const ms = Date.parse(iso[0].replace(" ", "T"));
    if (!Number.isNaN(ms)) return ms;
  }
  return null;
}

export function isErrorLine(line) {
  if (!line.trim()) return false;
  if (/^\s*(INFO|DEBUG|TRACE)\b/i.test(line)) return false;
  return ERROR_PATTERNS.some((pattern) => pattern.test(line));
}

export function groupErrors(lines, windowStartMs) {
  const groups = new Map();
  for (const entry of lines) {
    if (entry.timestamp && entry.timestamp < windowStartMs) continue;
    const key = entry.line
      .replace(/\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g, "<ts>")
      .replace(/\b[0-9a-f]{8,}\b/gi, "<id>")
      .slice(0, 240);
    const existing = groups.get(key) || {
      signature: key,
      count: 0,
      first_seen: entry.timestamp,
      last_seen: entry.timestamp,
      samples: [],
    };
    existing.count += 1;
    if (entry.timestamp) {
      existing.first_seen = Math.min(existing.first_seen ?? entry.timestamp, entry.timestamp);
      existing.last_seen = Math.max(existing.last_seen ?? entry.timestamp, entry.timestamp);
    }
    if (existing.samples.length < 5) existing.samples.push(entry.line.slice(0, 500));
    groups.set(key, existing);
  }
  return [...groups.values()].sort((a, b) => (b.last_seen ?? 0) - (a.last_seen ?? 0));
}

export function analyzeLogText(raw, windowStartMs) {
  const rawLines = String(raw).split(/\r?\n/);
  const parsedLines = rawLines.map((line) => ({
    line,
    timestamp: parseTimestamp(line),
    is_error: isErrorLine(line),
  }));
  const errorLines = parsedLines.filter((entry) => entry.is_error);
  const recentErrors = errorLines.filter(
    (entry) => !entry.timestamp || entry.timestamp >= windowStartMs,
  );
  const groups = groupErrors(recentErrors.length ? recentErrors : errorLines, windowStartMs);
  return {
    total_lines: rawLines.length,
    error_line_count: errorLines.length,
    recent_error_line_count: recentErrors.length,
    error_groups: groups,
    note:
      recentErrors.length === 0 && errorLines.length > 0
        ? "No timestamped errors fell inside the window; returning unscoped error tail for review."
        : undefined,
  };
}

async function fetchCoolifyLogs(baseUrl, token, appUuid, lines) {
  const url = `${baseUrl}/api/v1/applications/${appUuid}/logs?lines=${lines}&show_timestamps=true`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Coolify logs HTTP ${response.status}: ${body.slice(0, 400)}`);
  }
  try {
    const parsed = JSON.parse(body);
    return parsed.logs || parsed.message || body;
  } catch {
    return body;
  }
}

async function localLogCandidates() {
  const paths = [...LOCAL_LOG_PATHS];
  const logDirs = [
    "/home/openhands/.openhands/logs",
    "/home/openhands/.openhands/agent-canvas/logs",
  ];
  for (const dir of logDirs) {
    try {
      const files = await fs.readdir(dir);
      for (const file of files) {
        if (file.endsWith(".log")) paths.push(path.join(dir, file));
      }
    } catch {
      // ignore missing dirs
    }
  }
  return paths;
}

async function fetchLocalLogs(maxLines) {
  const paths = await localLogCandidates();
  const chunks = [];
  for (const filePath of paths) {
    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) continue;
      const text = await fs.readFile(filePath, "utf8");
      if (!text.trim()) continue;
      chunks.push(`# ${filePath}\n${text}`);
    } catch {
      // ignore unreadable files
    }
  }
  const combined = chunks.join("\n");
  const lines = combined.split(/\r?\n/);
  return lines.slice(-maxLines).join("\n");
}

async function fetchLogs(opts) {
  try {
    const creds = await resolveCoolifyCreds();
    const appUuid = (process.env.COOLIFY_APP_UUID || DEFAULT_APP_UUID).trim();
    const raw = await fetchCoolifyLogs(creds.baseUrl, creds.token, appUuid, opts.lines);
    return { source: "coolify-api", baseUrl: creds.baseUrl, raw };
  } catch (error) {
    const raw = await fetchLocalLogs(opts.lines);
    if (!raw.trim()) throw error;
    return {
      source: "local-fallback",
      baseUrl: process.env.COOLIFY_BASE_URL || process.env.COOLIFY_URL || DEFAULT_BASE_URL,
      raw,
      warning: `Coolify API unavailable (${error.message}); used local log files instead.`,
    };
  }
}

async function main() {
  const opts = parseArgs(process.argv);
  const appUuid = (process.env.COOLIFY_APP_UUID || DEFAULT_APP_UUID).trim();
  const fqdn = process.env.SHIP_FQDN || process.env.COOLIFY_FQDN || "ship.beenex.org";
  const windowStartMs = Date.now() - opts.hours * 60 * 60 * 1000;

  const fetched = await fetchLogs(opts);
  const analysis = analyzeLogText(fetched.raw, windowStartMs);

  const payload = {
    app_uuid: appUuid,
    fqdn,
    source: fetched.source,
    base_url: fetched.baseUrl,
    window_hours: opts.hours,
    window_start: new Date(windowStartMs).toISOString(),
    fetched_at: new Date().toISOString(),
    warning: fetched.warning,
    ...analysis,
  };

  const text = `${JSON.stringify(payload, null, 2)}\n`;
  if (opts.out) await fs.writeFile(opts.out, text, "utf8");
  process.stdout.write(text);
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  main().catch((error) => {
    console.error(`[ship-coolify-logs] ${error.stack || error.message || error}`);
    process.exitCode = 1;
  });
}

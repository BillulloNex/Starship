/**
 * Codex / ChatGPT Usage Proxy
 *
 * Secure server-side proxy between Grokbot frontend and OpenAI's Codex usage endpoint
 * (https://chatgpt.com/backend-api/wham/usage).
 *
 * Resolves session tokens from request headers, CODEX_AUTH_JSON environment secret,
 * or the host ~/.codex/auth.json file, and caches responses (60s TTL) to prevent
 * excessive polling and rate limits.
 */

import { request as httpsRequest } from "node:https";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

const CACHE_TTL_MS = 60 * 1000; // 60s cache
const usageCache = new Map(); // tokenHash -> { timestamp, data }

/**
 * Extract token from a raw string or auth.json contents
 */
export function extractAccessToken(raw) {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.tokens?.access_token) return parsed.tokens.access_token;
      if (parsed.access_token) return parsed.access_token;
      if (parsed.accessToken) return parsed.accessToken;
      if (parsed.tokens?.session_token) return parsed.tokens.session_token;
      if (parsed.session_token) return parsed.session_token;
    } catch {
      // Not valid JSON, treat as raw token
    }
  }

  // Handle "Bearer <token>" prefix
  if (trimmed.startsWith("Bearer ")) {
    return trimmed.slice(7).trim();
  }

  return trimmed;
}

/**
 * Attempt to read token from ~/.codex/auth.json on host
 */
async function getHostCodexToken() {
  // Check env var first
  if (process.env.CODEX_AUTH_JSON) {
    const token = extractAccessToken(process.env.CODEX_AUTH_JSON);
    if (token) return token;
  }

  // Check file in CODEX_HOME or ~/.codex/auth.json
  const codexHome = process.env.CODEX_HOME || join(homedir(), ".codex");
  const authPath = join(codexHome, "auth.json");

  try {
    const content = await readFile(authPath, "utf-8");
    return extractAccessToken(content);
  } catch {
    return null;
  }
}

/**
 * Fetch raw usage stats from ChatGPT backend
 */
function fetchWhamUsage(token) {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      {
        host: "chatgpt.com",
        port: 443,
        path: "/backend-api/wham/usage",
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": "Grokbot-Observability/1.0",
          Accept: "application/json",
        },
        timeout: 10000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          try {
            const data = JSON.parse(raw);
            resolve({ statusCode: res.statusCode, data });
          } catch (e) {
            resolve({
              statusCode: res.statusCode,
              raw,
              error: `Invalid JSON response: ${e.message}`,
            });
          }
        });
      },
    );

    req.on("error", (err) => reject(err));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("ChatGPT usage API request timed out after 10s"));
    });
    req.end();
  });
}

function normalizeWindow(win) {
  if (!win || typeof win !== "object") return null;

  const limitSeconds = Number(
    win.limit_window_seconds || win.window_seconds || win.window || win.seconds || win.limit_seconds,
  ) || 0;

  let rawUsed =
    win.used_percent ?? win.usedPercent ?? win.percentage ?? win.used_percentage ?? win.consumed_percent ?? 0;
  let usedPercent = Number(rawUsed) || 0;
  // If given as a 0..1 decimal fraction (e.g. 0.24 instead of 24)
  if (usedPercent > 0 && usedPercent <= 1.0) {
    usedPercent = Math.round(usedPercent * 1000) / 10;
  } else {
    usedPercent = Math.max(0, Math.min(100, Math.round(usedPercent * 10) / 10));
  }

  const remainingPercent = Math.max(0, Math.min(100, Math.round((100 - usedPercent) * 10) / 10));

  let resetAt = Number(win.reset_at || win.nextResetTime || win.resetAt || win.resets_at) || null;
  // If relative reset duration is provided (e.g. resets_in_seconds / reset_after_seconds)
  if (!resetAt) {
    const relSeconds = Number(win.resets_in_seconds || win.reset_after_seconds || win.resets_in) || 0;
    if (relSeconds > 0) {
      resetAt = Math.floor(Date.now() / 1000) + relSeconds;
    }
  }

  const limitReached = Boolean(win.limit_reached || win.limitReached || usedPercent >= 100);

  return {
    limitSeconds,
    usedPercent,
    remainingPercent,
    resetAt,
    limitReached,
  };
}

/**
 * Normalize ChatGPT WHAM usage payload into structured quota data
 */
export function normalizeWhamUsage(data) {
  if (!data || typeof data !== "object") {
    return null;
  }

  const planType = typeof data.plan_type === "string" ? data.plan_type : (data.plan || "standard");

  let primaryWindow = null;
  let secondaryWindow = null;

  // 1. Check data.rate_limit.primary_window and data.rate_limit.secondary_window
  if (data.rate_limit && typeof data.rate_limit === "object") {
    if (data.rate_limit.primary_window) {
      primaryWindow = normalizeWindow(data.rate_limit.primary_window);
    }
    if (data.rate_limit.secondary_window) {
      secondaryWindow = normalizeWindow(data.rate_limit.secondary_window);
    }
    // If rate_limit itself is a single window object
    if (
      !primaryWindow &&
      (data.rate_limit.used_percent !== undefined || data.rate_limit.limit_window_seconds !== undefined)
    ) {
      primaryWindow = normalizeWindow(data.rate_limit);
    }
  }

  // 2. Check top-level primary_window / secondary_window / session_limit / weekly_limit
  if (!primaryWindow && data.primary_window) primaryWindow = normalizeWindow(data.primary_window);
  if (!secondaryWindow && data.secondary_window) secondaryWindow = normalizeWindow(data.secondary_window);
  if (!primaryWindow && data.session_limit) primaryWindow = normalizeWindow(data.session_limit);
  if (!secondaryWindow && data.weekly_limit) secondaryWindow = normalizeWindow(data.weekly_limit);

  // 3. Check rate_limits or limits arrays / objects
  if (!primaryWindow || !secondaryWindow) {
    const rawLimits = [];
    if (Array.isArray(data.rate_limits)) rawLimits.push(...data.rate_limits);
    else if (data.rate_limits && typeof data.rate_limits === "object") {
      Object.values(data.rate_limits).forEach((v) => rawLimits.push(v));
    }
    if (Array.isArray(data.limits)) rawLimits.push(...data.limits);
    if (Array.isArray(data.windows)) rawLimits.push(...data.windows);

    for (const limit of rawLimits) {
      const parsed = normalizeWindow(limit);
      if (!parsed) continue;

      if (parsed.limitSeconds > 0 && parsed.limitSeconds <= 36000 && !primaryWindow) {
        primaryWindow = parsed;
      } else if (parsed.limitSeconds > 36000 && !secondaryWindow) {
        secondaryWindow = parsed;
      } else if (!primaryWindow) {
        primaryWindow = parsed;
      } else if (!secondaryWindow) {
        secondaryWindow = parsed;
      }
    }
  }

  // If only one window was found and placed in secondary, promote to primary
  if (!primaryWindow && secondaryWindow) {
    primaryWindow = secondaryWindow;
    secondaryWindow = null;
  }

  return {
    provider: "codex",
    planType,
    primaryWindow,
    secondaryWindow,
    updatedAt: Math.floor(Date.now() / 1000),
  };
}

/**
 * Handle HTTP requests to /api/observability/codex/usage
 */
export async function handleCodexUsageProxy(req, res, pathname, query = {}) {
  // CORS / methods
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Codex-Token",
    });
    res.end();
    return;
  }

  if (req.method !== "GET" && req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  // Resolve token from request headers or body or query or host
  let token = null;

  const authHeader = req.headers["authorization"] || req.headers["x-codex-token"];
  if (authHeader) {
    token = extractAccessToken(authHeader);
  }

  if (!token && query.token) {
    token = extractAccessToken(query.token);
  }

  // If not in headers/query and POST request, check body
  if (!token && req.method === "POST") {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const bodyStr = Buffer.concat(chunks).toString("utf8");
    token = extractAccessToken(bodyStr);
  }

  // Fallback to host credentials
  if (!token) {
    token = await getHostCodexToken();
  }

  if (!token) {
    res.writeHead(400, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(
      JSON.stringify({
        error: "Missing Codex session token or auth.json credentials",
        status: "unauthenticated",
      }),
    );
    return;
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const cached = usageCache.get(tokenHash);
  const now = Date.now();

  // Force refresh flag in query (e.g. ?refresh=true)
  const bypassCache = query.refresh === "true" || query.refresh === "1";

  if (!bypassCache && cached && now - cached.timestamp < CACHE_TTL_MS) {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "X-Cache": "HIT",
    });
    res.end(JSON.stringify(cached.data));
    return;
  }

  try {
    const result = await fetchWhamUsage(token);

    if (result.statusCode === 401 || result.statusCode === 403) {
      res.writeHead(401, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(
        JSON.stringify({
          error: "Codex session token expired or invalid. Please re-authenticate.",
          status: "expired",
        }),
      );
      return;
    }

    if (result.statusCode !== 200) {
      res.writeHead(result.statusCode || 502, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(
        JSON.stringify({
          error: `OpenAI Codex usage API returned status ${result.statusCode}`,
          details: result.data || result.raw,
        }),
      );
      return;
    }

    const normalized = normalizeWhamUsage(result.data);
    if (!normalized) {
      res.writeHead(502, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(JSON.stringify({ error: "Failed to parse usage response" }));
      return;
    }

    // Cache successful response
    usageCache.set(tokenHash, {
      timestamp: now,
      data: normalized,
    });

    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "X-Cache": "MISS",
    });
    res.end(JSON.stringify(normalized));
  } catch (err) {
    console.error("Codex usage proxy error:", err);
    res.writeHead(500, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(JSON.stringify({ error: err.message }));
  }
}

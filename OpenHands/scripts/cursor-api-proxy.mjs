/**
 * Server-side proxy for Cursor's documented user API-key surface.
 *
 * The browser never calls api.cursor.com directly. It supplies the saved
 * CURSOR_API_KEY to this same-origin endpoint (or the host provides the key),
 * and the proxy returns only normalized model metadata / aggregate token
 * counts. Personal plan balance and reset windows are intentionally absent:
 * Cursor does not expose those through the user API key.
 */
import { createHash } from "node:crypto";
import process from "node:process";

const CURSOR_API_BASE_URL =
  process.env.CURSOR_API_BASE_URL || "https://api.cursor.com";
const MODEL_CACHE_TTL_MS = 5 * 60_000;
const USAGE_CACHE_TTL_MS = 60_000;
const MAX_BODY_BYTES = 16 * 1024;
const MAX_AGENT_PAGES = 5;
const AGENT_PAGE_SIZE = 100;
const USAGE_CONCURRENCY = 5;

const responseCache = new Map();

function json(res, status, body, extraHeaders = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  res.end(JSON.stringify(body));
}

function keyFromAuthorization(value) {
  if (!value || typeof value !== "string") return null;
  const [scheme, credential] = value.trim().split(/\s+/, 2);
  if (!credential) return value.trim() || null;
  if (scheme.toLowerCase() === "bearer") return credential.trim() || null;
  if (scheme.toLowerCase() === "basic") {
    try {
      return (
        Buffer.from(credential, "base64").toString("utf8").split(":", 1)[0] ||
        null
      );
    } catch {
      return null;
    }
  }
  return null;
}

function extractKey(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const fromAuth = keyFromAuthorization(trimmed);
  if (fromAuth && fromAuth !== trimmed) return fromAuth;
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === "string") return parsed.trim() || null;
    if (parsed && typeof parsed === "object") {
      const candidate = parsed.CURSOR_API_KEY ?? parsed.apiKey ?? parsed.key;
      return typeof candidate === "string" ? candidate.trim() || null : null;
    }
  } catch {
    // A raw key is the normal POST body.
  }
  return trimmed;
}

async function readBody(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) throw new Error("Request body too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function resolveKey(req) {
  const headerKey =
    extractKey(req.headers["x-cursor-api-key"]) ||
    keyFromAuthorization(req.headers.authorization);
  if (headerKey) return headerKey;
  if (req.method === "POST") {
    const bodyKey = extractKey(await readBody(req));
    if (bodyKey) return bodyKey;
  }
  return extractKey(process.env.CURSOR_API_KEY || "");
}

async function cursorRequest(pathname, key) {
  const response = await fetch(`${CURSOR_API_BASE_URL}${pathname}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}`,
      "User-Agent": "grokbot-cursor-api/1.0",
    },
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text.slice(0, 500) };
  }
  if (!response.ok) {
    const error = new Error(
      data?.error?.message ||
        data?.message ||
        `Cursor API returned ${response.status}`,
    );
    error.statusCode = response.status;
    error.details = data;
    throw error;
  }
  return data;
}

export function formatCursorModelId(baseId, params = []) {
  const serialized = params
    .filter((param) => param && typeof param.id === "string")
    .map((param) => `${param.id}=${String(param.value)}`)
    .join(",");
  return `${baseId}[${serialized}]`;
}

function titleCase(value) {
  return String(value)
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function variantLabel(item, variant) {
  const parameterMap = new Map(
    (item.parameters || []).map((parameter) => [parameter.id, parameter]),
  );
  const suffixes = [];
  for (const param of variant.params || []) {
    // Cursor includes internal catalog switches in some variants. They are
    // required in the exact id but should not clutter the human label.
    if (param.id === "cyber") continue;
    const definition = parameterMap.get(param.id);
    const valueDefinition = definition?.values?.find(
      (candidate) => String(candidate.value) === String(param.value),
    );
    if (String(param.value) === "false") continue;
    if (String(param.value) === "true") {
      suffixes.push(definition?.displayName || titleCase(param.id));
      continue;
    }
    suffixes.push(
      valueDefinition?.displayName || titleCase(String(param.value)),
    );
  }
  return [variant.displayName || item.displayName || item.id, ...suffixes].join(
    " · ",
  );
}

export function normalizeCursorModels(payload) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return items.flatMap((item) => {
    if (!item || typeof item.id !== "string") return [];
    const variants = Array.isArray(item.variants) ? item.variants : [];

    if (variants.length === 0) {
      return [
        {
          id: formatCursorModelId(item.id, []),
          baseId: item.id,
          label: item.displayName || item.id,
          params: [],
          isDefault: item.id === "default",
        },
      ];
    }

    const preferred = variants.find((variant) => variant?.isDefault === true) ||
      variants[0] || {
        params: [],
        displayName: item.displayName,
      };
    const params = Array.isArray(preferred.params) ? preferred.params : [];
    return [
      {
        id: formatCursorModelId(item.id, params),
        baseId: item.id,
        label: variantLabel(item, preferred),
        params: params.map((param) => ({
          id: String(param.id),
          value: String(param.value),
        })),
        isDefault: item.id === "default",
      },
    ];
  });
}

async function getAllAgents(key) {
  const agents = [];
  let cursor = null;
  let truncated = false;
  for (let page = 0; page < MAX_AGENT_PAGES; page += 1) {
    const params = new URLSearchParams({
      limit: String(AGENT_PAGE_SIZE),
      includeArchived: "true",
    });
    if (cursor) params.set("cursor", cursor);
    const data = await cursorRequest(`/v1/agents?${params.toString()}`, key);
    const items = Array.isArray(data?.items) ? data.items : [];
    agents.push(...items);
    cursor = typeof data?.nextCursor === "string" ? data.nextCursor : null;
    if (!cursor) return { agents, truncated: false };
  }
  truncated = Boolean(cursor);
  return { agents, truncated };
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await fn(items[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

function emptyTokenUsage() {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    totalTokens: 0,
  };
}

async function fetchCursorUsage(key) {
  const { agents, truncated } = await getAllAgents(key);
  let unavailableAgentCount = 0;
  const snapshots = await mapWithConcurrency(
    agents.filter((agent) => typeof agent?.id === "string"),
    USAGE_CONCURRENCY,
    async (agent) => {
      try {
        return await cursorRequest(
          `/v1/agents/${encodeURIComponent(agent.id)}/usage`,
          key,
        );
      } catch {
        unavailableAgentCount += 1;
        return null;
      }
    },
  );
  const totalUsage = emptyTokenUsage();
  let runCount = 0;
  for (const snapshot of snapshots) {
    if (!snapshot) continue;
    const usage = snapshot.totalUsage || {};
    for (const field of Object.keys(totalUsage)) {
      totalUsage[field] += Number(usage[field] || 0);
    }
    runCount += Array.isArray(snapshot.runs) ? snapshot.runs.length : 0;
  }
  return {
    provider: "cursor",
    scope: "cloud-agents",
    agentCount: agents.length,
    activeAgentCount: agents.filter(
      (agent) => !["ARCHIVED", "DELETED"].includes(String(agent?.status)),
    ).length,
    runCount,
    unavailableAgentCount,
    truncated,
    totalUsage,
    updatedAt: Math.floor(Date.now() / 1000),
    planQuotaAvailable: false,
  };
}

async function cached(key, kind, ttl, loader) {
  const cacheKey = `${kind}:${createHash("sha256").update(key).digest("hex")}`;
  const now = Date.now();
  const hit = responseCache.get(cacheKey);
  if (hit && now - hit.timestamp < ttl) return { data: hit.data, hit: true };
  const data = await loader();
  responseCache.set(cacheKey, { timestamp: now, data });
  return { data, hit: false };
}

export async function handleCursorApiProxy(req, res, pathname, query = {}) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-Cursor-API-Key",
    });
    res.end();
    return;
  }
  if (req.method !== "GET" && req.method !== "POST") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  const key = await resolveKey(req);
  if (!key) {
    json(res, 400, {
      provider: "cursor",
      status: "unauthenticated",
      error: "Missing CURSOR_API_KEY",
    });
    return;
  }

  try {
    const bypassCache = query.refresh === "true" || query.refresh === "1";
    if (bypassCache) {
      const keyHash = createHash("sha256").update(key).digest("hex");
      responseCache.delete(`models:${keyHash}`);
      responseCache.delete(`usage:${keyHash}`);
    }

    if (pathname.endsWith("/models")) {
      const result = await cached(
        key,
        "models",
        MODEL_CACHE_TTL_MS,
        async () => {
          const payload = await cursorRequest("/v1/models", key);
          const models = normalizeCursorModels(payload);
          return {
            provider: "cursor",
            models,
            modelCount: models.length,
            updatedAt: Math.floor(Date.now() / 1000),
          };
        },
      );
      json(res, 200, result.data, { "X-Cache": result.hit ? "HIT" : "MISS" });
      return;
    }

    if (pathname.endsWith("/usage")) {
      const result = await cached(key, "usage", USAGE_CACHE_TTL_MS, () =>
        fetchCursorUsage(key),
      );
      json(res, 200, result.data, { "X-Cache": result.hit ? "HIT" : "MISS" });
      return;
    }

    json(res, 404, { error: "Unknown Cursor observability endpoint" });
  } catch (error) {
    const status = error?.statusCode === 401 ? 401 : error?.statusCode || 502;
    json(res, status, {
      provider: "cursor",
      status: status === 401 ? "unauthenticated" : "error",
      error:
        error instanceof Error ? error.message : "Cursor API request failed",
    });
  }
}

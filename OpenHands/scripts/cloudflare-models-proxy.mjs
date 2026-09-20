/**
 * Same-origin proxy for Cloudflare's live model catalog.
 *
 * The browser cannot call api.cloudflare.com (CORS). This handler uses the
 * Unified Catalog list endpoint that the Cloudflare dashboard and docs
 * importer use, then falls back to Workers AI Model Search.
 *
 * Official sources:
 * - GET /accounts/{account_id}/ai/catalog/models
 *   (cloudflare-docs bin/fetch-catalog-models.ts)
 * - GET /accounts/{account_id}/ai/models/search
 *   https://developers.cloudflare.com/api/resources/ai/subresources/models/methods/list/
 */

import { createHash } from "node:crypto";

const CF_API_BASE =
  process.env.CLOUDFLARE_API_BASE_URL?.replace(/\/$/, "") ||
  "https://api.cloudflare.com";
const PER_PAGE = 100;
const MAX_PAGES = 25;
const MAX_BODY_BYTES = 16 * 1024;
const CACHE_TTL_MS = 5 * 60_000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; Grokbot/1.0; +https://ship.beenex.org)";

const ACCOUNT_ID_PATTERN = /^[a-zA-Z0-9_-]{16,64}$/;
const CHAT_TASKS = new Set(["text generation", "llm"]);
const CHAT_FORMATS = new Set([
  "chat completions",
  "chat completion",
  "anthropic messages",
]);
const EXCLUDED_TASKS = new Set([
  "text embeddings",
  "text-to-image",
  "text to image",
  "text-to-speech",
  "text to speech",
  "automatic speech recognition",
  "image-to-text",
  "image to text",
  "translation",
  "text classification",
  "image classification",
  "object detection",
  "reranker",
  "music generation",
  "video generation",
]);

const catalogCache = new Map();

export const CLOUDFLARE_MODELS_PATH = "/api/cloudflare/models";

function json(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

export function isCloudflareAccountId(value) {
  return typeof value === "string" && ACCOUNT_ID_PATTERN.test(value.trim());
}

export function catalogModelsUrl(accountId, page) {
  return `${CF_API_BASE}/client/v4/accounts/${encodeURIComponent(accountId)}/ai/catalog/models?page=${page}&per_page=${PER_PAGE}`;
}

export function workersAiSearchUrl(accountId, page) {
  const params = new URLSearchParams({
    page: String(page),
    per_page: String(PER_PAGE),
    task: "Text Generation",
  });
  return `${CF_API_BASE}/client/v4/accounts/${encodeURIComponent(accountId)}/ai/models/search?${params}`;
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function readString(...candidates) {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return "";
}

export function extractCatalogModelId(row) {
  const record = asRecord(row);
  if (!record) return "";
  return readString(record.model_id, record.id, record.name);
}

export function extractCatalogTask(row) {
  const record = asRecord(row);
  if (!record) return "";
  if (typeof record.task === "string") return record.task.trim();
  const nested = asRecord(record.task);
  return readString(nested?.name, nested?.title, nested?.id);
}

function extractRequestFormats(row) {
  const record = asRecord(row);
  if (!record) return [];
  const formats = record.request_formats ?? record.requestFormats;
  if (!Array.isArray(formats)) return [];
  return formats
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function extractLabel(row, id) {
  const record = asRecord(row);
  const name = readString(record?.display_name, record?.name);
  if (name && name !== id) return name;
  const parts = id.split("/");
  return parts[parts.length - 1] || id;
}

function isDeprecated(row) {
  const record = asRecord(row);
  const metadata = asRecord(record?.metadata) ?? {};
  const planned = readString(metadata.planned_deprecation_date);
  if (!planned) return false;
  const timestamp = Date.parse(planned);
  return Number.isFinite(timestamp) && Date.now() > timestamp;
}

export function isChatCatalogModel(row) {
  const record = asRecord(row);
  if (!record) return false;
  if (record.private === true) return false;
  if (isDeprecated(record)) return false;
  const id = extractCatalogModelId(record);
  if (!id.includes("/")) return false;

  const task = extractCatalogTask(record).toLowerCase();
  if (task && EXCLUDED_TASKS.has(task)) return false;

  const formats = extractRequestFormats(record).map((item) =>
    item.toLowerCase(),
  );
  if (formats.some((item) => CHAT_FORMATS.has(item))) return true;
  if (task && CHAT_TASKS.has(task)) return true;
  return false;
}

export function normalizeCloudflareCatalogModels(rows) {
  const seen = new Set();
  const models = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!isChatCatalogModel(row)) continue;
    const id = extractCatalogModelId(row);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    models.push({
      id,
      label: extractLabel(row, id),
      task: extractCatalogTask(row) || "Text Generation",
    });
  }
  models.sort((left, right) =>
    left.label.localeCompare(right.label, undefined, { sensitivity: "base" }),
  );
  return models;
}

function resultInfo(payload) {
  const info = asRecord(payload?.result_info) ?? asRecord(payload?.resultInfo);
  const page = Number(info?.page) || 1;
  const perPage = Number(info?.per_page ?? info?.perPage) || PER_PAGE;
  const total = Number(info?.total_count ?? info?.totalCount) || 0;
  return { page, perPage, total };
}

async function readJsonBody(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) throw new Error("Request body too large");
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  return asRecord(parsed) ?? {};
}

function credentialsFromRequest(req, query, body) {
  const accountId = readString(
    body.account_id,
    body.accountId,
    query.account_id,
    query.accountId,
  );
  const header = readString(req.headers?.authorization);
  const bearer = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
  const apiToken = readString(body.api_token, body.apiToken, bearer);
  return { accountId, apiToken };
}

async function fetchCloudflarePage(url, apiToken) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiToken}`,
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }
  return { status: response.status, payload, text };
}

async function fetchAllPages(buildUrl, apiToken) {
  const rows = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { status, payload, text } = await fetchCloudflarePage(
      buildUrl(page),
      apiToken,
    );
    if (status === 404 || status === 405) {
      return { ok: false, status, rows: [] };
    }
    if (status !== 200 || !payload?.success) {
      const message =
        payload?.errors?.[0]?.message ||
        payload?.messages?.[0] ||
        text.slice(0, 200) ||
        `Cloudflare catalog HTTP ${status}`;
      const error = new Error(String(message));
      error.status = status === 401 || status === 403 ? status : 502;
      throw error;
    }
    const batch = Array.isArray(payload.result) ? payload.result : [];
    rows.push(...batch);
    const info = resultInfo(payload);
    if (batch.length === 0) break;
    if (info.total > 0 && rows.length >= info.total) break;
    if (batch.length < PER_PAGE) break;
  }
  return { ok: true, status: 200, rows };
}

export async function fetchCloudflareLiveModels({ accountId, apiToken }) {
  const catalog = await fetchAllPages(
    (page) => catalogModelsUrl(accountId, page),
    apiToken,
  );
  if (catalog.ok) {
    return {
      source: "catalog",
      models: normalizeCloudflareCatalogModels(catalog.rows),
    };
  }

  const search = await fetchAllPages(
    (page) => workersAiSearchUrl(accountId, page),
    apiToken,
  );
  if (!search.ok) {
    const error = new Error("Cloudflare model catalog is unavailable");
    error.status = 502;
    throw error;
  }
  return {
    source: "search",
    models: normalizeCloudflareCatalogModels(search.rows),
  };
}

export async function handleCloudflareModelsProxy(
  req,
  res,
  pathname,
  query = {},
) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    });
    res.end();
    return;
  }

  if (pathname !== CLOUDFLARE_MODELS_PATH) {
    json(res, 404, { error: "Not found" });
    return;
  }

  if (req.method !== "GET" && req.method !== "POST") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  let body = {};
  if (req.method === "POST") {
    try {
      body = await readJsonBody(req);
    } catch (error) {
      json(res, 400, { error: error.message || "Invalid JSON body" });
      return;
    }
  }

  const { accountId, apiToken } = credentialsFromRequest(req, query, body);
  if (!isCloudflareAccountId(accountId)) {
    json(res, 400, { error: "A valid Cloudflare account ID is required" });
    return;
  }
  if (!apiToken) {
    json(res, 400, { error: "A Cloudflare API token is required" });
    return;
  }

  const cacheKey = createHash("sha256")
    .update(`${accountId}:${apiToken}`)
    .digest("hex");
  const cached = catalogCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    json(res, 200, cached.body);
    return;
  }

  try {
    const live = await fetchCloudflareLiveModels({ accountId, apiToken });
    const bodyOut = {
      source: live.source,
      modelCount: live.models.length,
      models: live.models,
    };
    catalogCache.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      body: bodyOut,
    });
    json(res, 200, bodyOut);
  } catch (error) {
    json(res, error.status || 502, {
      error: error.message || "Failed to load Cloudflare catalog",
    });
  }
}

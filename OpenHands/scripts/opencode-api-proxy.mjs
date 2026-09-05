/**
 * Server-side proxy for OpenCode models discovery.
 *
 * Calls the OpenCode Go API at https://opencode.ai/zen/go/v1/models
 * with the user's API key to dynamically discover available models.
 * Falls back gracefully to a static catalog if the API is unavailable.
 */
import process from "node:process";

const MODEL_CACHE_TTL_MS = 5 * 60_000;
const MAX_BODY_BYTES = 16 * 1024;
const OPENCODE_GO_API_BASE = "https://opencode.ai/zen/go/v1";

let cachedResult = null;
let cacheTimestamp = 0;

export const DEFAULT_OPENCODE_MODELS = [
  { id: "opencode/big-pickle", label: "OpenCode Big Pickle (Free)", isDefault: true },
  { id: "opencode/hy3-free", label: "OpenCode HY3 (Free)" },
  { id: "opencode/mimo-v2.5-free", label: "OpenCode MiMo v2.5 (Free)" },
  { id: "opencode/muse-spark-1.2-contributor-free", label: "OpenCode Muse Spark 1.2 (Free)" },
  { id: "opencode/nemotron-3-ultra-free", label: "OpenCode Nemotron 3 Ultra (Free)" },
  { id: "opencode/nemotron-3.5-lightning-free", label: "OpenCode Nemotron 3.5 Lightning (Free)" },
];

function json(res, status, body, extraHeaders = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  res.end(JSON.stringify(body));
}

function titleCase(value) {
  return String(value)
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatOpencodeModelLabel(id) {
  if (!id || typeof id !== "string") return id;
  return titleCase(id);
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

function extractKey(value) {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === "string") return parsed.trim() || null;
    if (parsed && typeof parsed === "object") {
      const candidate =
        parsed.OPENCODE_GO_API_KEY ??
        parsed.apiKey ??
        parsed.key ??
        parsed.ANTHROPIC_API_KEY ??
        parsed.OPENAI_API_KEY;
      return typeof candidate === "string" ? candidate.trim() || null : null;
    }
  } catch {
    // Raw key
  }
  return trimmed;
}

async function fetchSecret(name) {
  try {
    const resp = await fetch(`http://127.0.0.1:18000/api/settings/secrets/${name}`);
    if (!resp.ok) return null;
    const text = await resp.text();
    const trimmed = text.trim();
    if (!trimmed || /^\*+$/.test(trimmed)) return null;
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "string") return parsed.trim() || null;
    } catch {
      // Raw string value
    }
    return trimmed;
  } catch {
    return null;
  }
}

/**
 * Resolve the OpenCode Go API key from (in order):
 * 1. X-OpenCode-API-Key request header
 * 2. POST request body
 * 3. Agent Server secret store (OPENCODE_GO_API_KEY)
 * 4. Container environment variable (OPENCODE_GO_API_KEY)
 */
async function resolveApiKey(req) {
  // From request header
  const headerKey = extractKey(req.headers["x-opencode-api-key"]);
  if (headerKey) return headerKey;

  // From POST body
  if (req.method === "POST") {
    try {
      const body = await readBody(req);
      const bodyKey = extractKey(body);
      if (bodyKey) return bodyKey;
    } catch {
      // ignore
    }
  }

  // From secret store
  const secretKey = await fetchSecret("OPENCODE_GO_API_KEY");
  if (secretKey) return secretKey;

  // From container env
  if (process.env.OPENCODE_GO_API_KEY) return process.env.OPENCODE_GO_API_KEY;

  return null;
}

/**
 * Fetch models from the OpenCode Go API.
 * Returns { models: [...], source: "api"|"fallback" }
 */
export async function fetchOpencodeModels(apiKey) {
  if (!apiKey) {
    return { models: DEFAULT_OPENCODE_MODELS, source: "fallback-no-key" };
  }

  try {
    const resp = await fetch(`${OPENCODE_GO_API_BASE}/models`, {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!resp.ok) {
      return {
        models: DEFAULT_OPENCODE_MODELS,
        source: `fallback-http-${resp.status}`,
      };
    }

    const data = await resp.json();

    if (data?.data && Array.isArray(data.data)) {
      const models = data.data.map((m) => ({
        id: `opencode-go/${m.id}`,
        label: formatOpencodeModelLabel(m.id),
        isDefault: m.id === "deepseek-v4-pro",
      }));

      // Prepend free models so they're always available
      const freeModels = DEFAULT_OPENCODE_MODELS.map((m) => ({
        ...m,
        isDefault: false, // Go models take priority
      }));

      return {
        models: [...models, ...freeModels],
        source: "api",
        apiModelCount: data.data.length,
      };
    }

    return { models: DEFAULT_OPENCODE_MODELS, source: "fallback-bad-response" };
  } catch (err) {
    return {
      models: DEFAULT_OPENCODE_MODELS,
      source: `fallback-error: ${err?.message?.substring(0, 100)}`,
    };
  }
}

export async function handleOpencodeApiProxy(req, res, pathname, query = {}) {
  if (req.method === "OPTIONS") {
    json(res, 204, null, {
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-OpenCode-API-Key",
    });
    return;
  }

  if (pathname === "/api/observability/opencode/models") {
    const forceRefresh = query.refresh === "true" || query.refresh === "1";
    const now = Date.now();

    if (!forceRefresh && cachedResult && now - cacheTimestamp < MODEL_CACHE_TTL_MS) {
      json(res, 200, cachedResult);
      return;
    }

    try {
      const apiKey = await resolveApiKey(req);
      const { models, source, apiModelCount } = await fetchOpencodeModels(apiKey);
      cachedResult = {
        provider: "opencode",
        models,
        modelCount: models.length,
        updatedAt: now,
        _debug: {
          source,
          hasApiKey: !!apiKey,
          apiModelCount: apiModelCount ?? 0,
        },
      };
      cacheTimestamp = now;
      json(res, 200, cachedResult);
      return;
    } catch (err) {
      json(res, 500, {
        provider: "opencode",
        error: err.message || "Failed to fetch OpenCode models",
        models: DEFAULT_OPENCODE_MODELS,
        modelCount: DEFAULT_OPENCODE_MODELS.length,
        updatedAt: now,
      });
      return;
    }
  }

  json(res, 404, { error: `Endpoint ${pathname} not found on OpenCode proxy` });
}

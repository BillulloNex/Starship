/**
 * Server-side proxy for OpenCode models discovery.
 *
 * Runs `opencode models` with any provided or saved API credentials to dynamically
 * discover available models (built-in free models, OpenCode Zen, Anthropic, OpenAI, etc.).
 * Falls back gracefully to the verified catalog if the CLI is unavailable.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import process from "node:process";

const execFileAsync = promisify(execFile);
const MODEL_CACHE_TTL_MS = 5 * 60_000;
const MAX_BODY_BYTES = 16 * 1024;

let cachedResult = null;
let cacheTimestamp = 0;

export const DEFAULT_OPENCODE_MODELS = [
  { id: "opencode/big-pickle", label: "OpenCode Big Pickle (Free)", isDefault: true },
  { id: "opencode/hy3-free", label: "OpenCode HY3 (Free)" },
  { id: "opencode/mimo-v2.5-free", label: "OpenCode MiMo v2.5 (Free)" },
  { id: "opencode/muse-spark-1.2-contributor-free", label: "OpenCode Muse Spark 1.2 (Free)" },
  { id: "opencode/nemotron-3-ultra-free", label: "OpenCode Nemotron 3 Ultra (Free)" },
  { id: "opencode/nemotron-3.5-lightning-free", label: "OpenCode Nemotron 3.5 Lightning (Free)" },
  { id: "anthropic/claude-sonnet-4-6", label: "Anthropic Claude Sonnet 4.6" },
  { id: "anthropic/claude-opus-4-6", label: "Anthropic Claude Opus 4.6" },
  { id: "anthropic/claude-haiku-4-5", label: "Anthropic Claude Haiku 4.5" },
  { id: "openai/gpt-5.6", label: "OpenAI GPT-5.6" },
  { id: "openai/gpt-5.5", label: "OpenAI GPT-5.5" },
  { id: "openai/gpt-5.4", label: "OpenAI GPT-5.4" },
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
  const parts = id.split("/");
  if (parts.length === 2) {
    const [provider, model] = parts;
    const providerName = titleCase(provider);
    const modelName = titleCase(model);
    const isFree = model.endsWith("-free");
    return `${providerName} ${modelName}${isFree ? "" : ""}`;
  }
  return titleCase(id);
}

export function parseOpencodeModelsOutput(stdout) {
  if (!stdout || typeof stdout !== "string") return [];
  const lines = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("{") && !line.startsWith("}") && !line.startsWith("Error"));

  const seen = new Set();
  const models = [];

  for (const line of lines) {
    // Look for lines formatted like `provider/model`
    if (line.includes("/") && !line.includes(" ") && !seen.has(line)) {
      seen.add(line);
      models.push({
        id: line,
        label: formatOpencodeModelLabel(line),
        isDefault: line === "opencode/big-pickle",
      });
    }
  }

  return models;
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
    // The secret store may return the raw value or JSON-wrapped
    if (!trimmed || /^\*+$/.test(trimmed)) return null;
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "string") return parsed.trim() || null;
      // If it's a JSON object (like OPENCODE_AUTH_JSON), return the raw text
      if (typeof parsed === "object") return trimmed;
    } catch {
      // Raw string value
    }
    return trimmed;
  } catch {
    return null;
  }
}

async function resolveEnv(req) {
  const env = { ...process.env };
  const headerKey = extractKey(req.headers["x-opencode-api-key"]);
  if (headerKey) {
    if (headerKey.startsWith("sk-ant-")) {
      env.ANTHROPIC_API_KEY = headerKey;
    } else if (headerKey.startsWith("sk-")) {
      env.OPENAI_API_KEY = headerKey;
    } else {
      env.OPENCODE_GO_API_KEY = headerKey;
    }
  }
  if (req.method === "POST") {
    try {
      const body = await readBody(req);
      const bodyKey = extractKey(body);
      if (bodyKey) {
        if (bodyKey.startsWith("sk-ant-")) {
          env.ANTHROPIC_API_KEY = bodyKey;
        } else if (bodyKey.startsWith("sk-")) {
          env.OPENAI_API_KEY = bodyKey;
        } else {
          env.OPENCODE_GO_API_KEY = bodyKey;
        }
      }
    } catch {
      // Body reading ignored
    }
  }

  // Fetch keys from Agent Server secret store if not already set
  const secretMap = [
    ["OPENCODE_GO_API_KEY", "OPENCODE_GO_API_KEY"],
    ["ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY"],
    ["OPENAI_API_KEY", "OPENAI_API_KEY"],
    ["GEMINI_API_KEY", "GEMINI_API_KEY"],
  ];
  for (const [envName, secretName] of secretMap) {
    if (!env[envName]) {
      const val = await fetchSecret(secretName);
      if (val) env[envName] = val;
    }
  }

  // Materialize auth.json so `opencode models` can discover authenticated models.
  // Priority: OPENCODE_AUTH_JSON (full blob) > build from individual API keys.
  let authJsonContent = null;

  if (env.OPENCODE_AUTH_JSON) {
    authJsonContent = env.OPENCODE_AUTH_JSON;
  } else {
    const fetched = await fetchSecret("OPENCODE_AUTH_JSON");
    if (fetched && fetched.startsWith("{")) {
      authJsonContent = fetched;
      env.OPENCODE_AUTH_JSON = fetched;
    }
  }

  // Build auth.json from individual keys if no explicit auth JSON
  if (!authJsonContent) {
    const authObj = {};
    if (env.OPENCODE_GO_API_KEY) {
      authObj["opencode-go"] = { type: "api", key: env.OPENCODE_GO_API_KEY };
    }
    if (env.ANTHROPIC_API_KEY) {
      authObj["anthropic"] = { type: "api", key: env.ANTHROPIC_API_KEY };
    }
    if (env.OPENAI_API_KEY) {
      authObj["openai"] = { type: "api", key: env.OPENAI_API_KEY };
    }
    if (env.GEMINI_API_KEY) {
      authObj["google"] = { type: "api", key: env.GEMINI_API_KEY };
    }
    if (Object.keys(authObj).length > 0) {
      authJsonContent = JSON.stringify(authObj);
    }
  }

  // Write auth.json to disk so `opencode models` CLI can read it
  if (authJsonContent) {
    try {
      const { mkdirSync, writeFileSync } = await import("node:fs");
      const { homedir } = await import("node:os");
      const { join } = await import("node:path");
      const dir = join(homedir(), ".local", "share", "opencode");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "auth.json"), authJsonContent, { mode: 0o600 });
    } catch {
      // Best effort
    }
  }

  return env;
}

export async function fetchOpencodeModels(env = process.env) {
  const debug = { authJsonPath: null, authJsonExists: false, rawStdout: null, rawStderr: null, attempt: null };
  try {
    const { readFileSync, existsSync } = await import("node:fs");
    const { homedir } = await import("node:os");
    const { join } = await import("node:path");
    const authPath = join(homedir(), ".local", "share", "opencode", "auth.json");
    debug.authJsonPath = authPath;
    debug.authJsonExists = existsSync(authPath);
    if (debug.authJsonExists) {
      try {
        const content = readFileSync(authPath, "utf8");
        debug.authJsonRaw = content.substring(0, 200);
        debug.authJsonLength = content.length;
        const parsed = JSON.parse(content);
        debug.authJsonProviders = Object.keys(parsed);
        debug.authJsonType = typeof parsed;
      } catch (parseErr) {
        debug.authJsonParseError = parseErr?.message?.substring(0, 200);
      }
    }
    // Also check env keys present (redacted)
    debug.envKeys = {
      OPENCODE_GO_API_KEY: !!env.OPENCODE_GO_API_KEY,
      ANTHROPIC_API_KEY: !!env.ANTHROPIC_API_KEY,
      OPENAI_API_KEY: !!env.OPENAI_API_KEY,
      GEMINI_API_KEY: !!env.GEMINI_API_KEY,
    };
  } catch { /* ignore */ }

  try {
    debug.attempt = "models --refresh";
    const { stdout, stderr } = await execFileAsync("opencode", ["models", "--refresh"], {
      env,
      timeout: 15_000,
    });
    debug.rawStdout = stdout?.substring(0, 1000);
    debug.rawStderr = stderr?.substring(0, 500);
    const parsed = parseOpencodeModelsOutput(stdout);
    if (parsed.length > 0) {
      return { models: parsed, _debug: debug };
    }
  } catch (err) {
    debug.refreshError = err?.message?.substring(0, 300);
    try {
      debug.attempt = "models";
      const { stdout, stderr } = await execFileAsync("opencode", ["models"], {
        env,
        timeout: 15_000,
      });
      debug.rawStdout = stdout?.substring(0, 1000);
      debug.rawStderr = stderr?.substring(0, 500);
      const parsed = parseOpencodeModelsOutput(stdout);
      if (parsed.length > 0) {
        return { models: parsed, _debug: debug };
      }
    } catch (err2) {
      debug.fallbackError = err2?.message?.substring(0, 300);
    }
  }
  return { models: DEFAULT_OPENCODE_MODELS, _debug: debug };
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
      const env = await resolveEnv(req);
      const { models, _debug } = await fetchOpencodeModels(env);
      cachedResult = {
        provider: "opencode",
        models,
        modelCount: models.length,
        updatedAt: now,
        _debug,
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

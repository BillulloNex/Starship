/**
 * Server-side Google Workspace MCP OAuth client.
 *
 * The GCP web client ID/secret are operator infrastructure (Coolify env),
 * not something a /mcp user should paste. This module injects them into
 * agent-server MCP OAuth start/test requests for official Google hosts.
 */
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import process from "node:process";

const MAX_BODY_BYTES = 64 * 1024;
const PROXY_TIMEOUT_MS = 125_000;

export const GOOGLE_WORKSPACE_MCP_HOSTS = new Set([
  "gmailmcp.googleapis.com",
  "drivemcp.googleapis.com",
  "docsmcp.googleapis.com",
]);

export const GOOGLE_WORKSPACE_OAUTH_PATHS = new Set([
  "/api/mcp/oauth/start",
  "/api/mcp/test",
]);

export function shouldInterceptGoogleWorkspaceMcp(req) {
  if (req?.method !== "POST") return false;
  try {
    const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    return GOOGLE_WORKSPACE_OAUTH_PATHS.has(pathname);
  } catch {
    return false;
  }
}

export function isGoogleWorkspaceMcpUrl(url) {
  if (typeof url !== "string" || !url) return false;
  try {
    return GOOGLE_WORKSPACE_MCP_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function getGoogleWorkspaceOAuthClient(env = process.env) {
  const clientId = String(env.GOOGLE_OAUTH_CLIENT_ID ?? "").trim();
  const clientSecret = String(env.GOOGLE_OAUTH_CLIENT_SECRET ?? "").trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function injectGoogleWorkspaceOAuthClient(body, env = process.env) {
  if (!isRecord(body) || !isRecord(body.server)) {
    return { ok: true, injected: false, body };
  }
  if (!isGoogleWorkspaceMcpUrl(body.server.url)) {
    return { ok: true, injected: false, body };
  }
  const client = getGoogleWorkspaceOAuthClient(env);
  if (!client) {
    return { ok: false, reason: "missing_env", body };
  }

  const server = { ...body.server };
  const auth = isRecord(server.auth)
    ? { ...server.auth }
    : { strategy: "oauth2" };
  const authentication = isRecord(auth.authentication)
    ? { ...auth.authentication }
    : { type: "oauth" };
  authentication.type = authentication.type || "oauth";
  authentication.client_auth_method =
    authentication.client_auth_method || "client_secret_post";
  authentication.client_id = client.clientId;
  authentication.client_secret = client.clientSecret;
  auth.strategy = "oauth2";
  auth.authentication = authentication;
  server.auth = auth;
  return { ok: true, injected: true, body: { ...body, server } };
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

function writeJson(res, status, payload) {
  if (res.headersSent) return;
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function parseBackendUrl(backendUrl) {
  const url = new URL(backendUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Invalid backend URL");
  }
  return {
    hostname: url.hostname,
    port:
      Number.parseInt(url.port, 10) || (url.protocol === "https:" ? 443 : 80),
    protocol: url.protocol,
  };
}

function forwardJson(req, res, backendUrl, jsonBody) {
  const backend = parseBackendUrl(backendUrl);
  const payload = Buffer.from(jsonBody, "utf8");
  const headers = {
    ...req.headers,
    host: `${backend.hostname}:${backend.port}`,
  };
  delete headers["content-length"];
  delete headers["transfer-encoding"];
  headers["content-type"] = "application/json";
  headers["content-length"] = String(payload.length);

  const request = backend.protocol === "https:" ? httpsRequest : httpRequest;
  const proxyReq = request(
    {
      hostname: backend.hostname,
      port: backend.port,
      path: req.url,
      method: req.method,
      headers,
      timeout: PROXY_TIMEOUT_MS,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );
  proxyReq.on("timeout", () => {
    proxyReq.destroy();
    writeJson(res, 504, { error: "Google Workspace OAuth start timed out" });
  });
  proxyReq.on("error", (err) => {
    writeJson(res, 502, {
      error: `Bad Gateway: ${err instanceof Error ? err.message : String(err)}`,
    });
  });
  proxyReq.end(payload);
}

export async function handleGoogleWorkspaceMcpProxy(req, res, backendUrl) {
  if (!shouldInterceptGoogleWorkspaceMcp(req)) return false;

  let raw;
  try {
    raw = await readBody(req);
  } catch (err) {
    writeJson(res, 413, {
      error: err instanceof Error ? err.message : "Request body too large",
    });
    return true;
  }

  let parsed;
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    writeJson(res, 400, { error: "Invalid JSON body" });
    return true;
  }

  const result = injectGoogleWorkspaceOAuthClient(parsed);
  if (!result.ok) {
    writeJson(res, 503, {
      error:
        "Google Workspace OAuth client is not configured on the server. Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in Coolify.",
    });
    return true;
  }

  forwardJson(req, res, backendUrl, JSON.stringify(result.body));
  return true;
}

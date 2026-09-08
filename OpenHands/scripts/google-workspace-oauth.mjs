/**
 * Server-side Google Workspace MCP OAuth client + public OAuth callback proxy.
 *
 * The GCP web client ID/secret are operator infrastructure (Coolify env),
 * not something a /mcp user should paste. This module injects them into
 * agent-server MCP OAuth start/test requests for official Google hosts.
 *
 * FastMCP still listens on loopback. Google must redirect the user's browser
 * to a public HTTPS URI registered on the web client. GET /callback is proxied
 * to that loopback listener so authorize and token-exchange share one URI.
 */
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import process from "node:process";

const MAX_BODY_BYTES = 64 * 1024;
const PROXY_TIMEOUT_MS = 125_000;
const CALLBACK_PROXY_TIMEOUT_MS = 15_000;

export const DEFAULT_MCP_OAUTH_CALLBACK_PORT = 18765;

export const MCP_OAUTH_PUBLIC_CALLBACK_PATHS = new Set([
  "/callback",
  "/mcp/gmail/callback",
]);

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

export const DEFAULT_MCP_OAUTH_REDIRECT_URI =
  "https://ship.beenex.org/callback";

export function getMcpOAuthCallbackPort(env = process.env) {
  const raw = String(
    env.GROKBOT_MCP_OAUTH_CALLBACK_PORT ?? DEFAULT_MCP_OAUTH_CALLBACK_PORT,
  ).trim();
  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    return DEFAULT_MCP_OAUTH_CALLBACK_PORT;
  }
  return port;
}

export function getMcpOAuthRedirectUri(env = process.env) {
  const explicit = String(env.GROKBOT_MCP_OAUTH_REDIRECT_URI ?? "").trim();
  if (explicit) return explicit;
  if (String(env.GOOGLE_OAUTH_CLIENT_ID ?? "").trim()) {
    return DEFAULT_MCP_OAUTH_REDIRECT_URI;
  }
  return "";
}

export function rewriteOAuthAuthorizationUrl(authorizationUrl, redirectUri) {
  if (typeof authorizationUrl !== "string" || !authorizationUrl) {
    return authorizationUrl;
  }
  if (typeof redirectUri !== "string" || !redirectUri) {
    return authorizationUrl;
  }
  try {
    const url = new URL(authorizationUrl);
    if (url.searchParams.has("redirect_uri")) {
      url.searchParams.set("redirect_uri", redirectUri);
    }
    return url.toString();
  } catch {
    return authorizationUrl;
  }
}

export function rewriteGoogleOAuthStartResponse(payload, env = process.env) {
  if (!isRecord(payload) || typeof payload.authorization_url !== "string") {
    return payload;
  }
  const redirectUri = getMcpOAuthRedirectUri(env);
  if (!redirectUri) return payload;
  return {
    ...payload,
    authorization_url: rewriteOAuthAuthorizationUrl(
      payload.authorization_url,
      redirectUri,
    ),
  };
}

function normalizeCallbackPath(pathname) {
  if (typeof pathname !== "string" || !pathname) return "/";
  return pathname.length > 1 && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;
}

export function shouldProxyMcpOAuthPublicCallback(req) {
  const method = req?.method;
  if (method !== "GET" && method !== "HEAD") return false;
  try {
    const pathname = normalizeCallbackPath(
      new URL(req.url ?? "/", "http://localhost").pathname,
    );
    return MCP_OAUTH_PUBLIC_CALLBACK_PATHS.has(pathname);
  } catch {
    return false;
  }
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

function forwardJson(req, res, backendUrl, jsonBody, transformResponse) {
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
      if (!transformResponse) {
        res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
        proxyRes.pipe(res);
        return;
      }
      const chunks = [];
      proxyRes.on("data", (chunk) => chunks.push(chunk));
      proxyRes.on("end", () => {
        let body = Buffer.concat(chunks).toString("utf8");
        try {
          body = JSON.stringify(transformResponse(JSON.parse(body)));
        } catch {
          // Keep the upstream body if it is not JSON.
        }
        const outHeaders = { ...proxyRes.headers };
        delete outHeaders["content-length"];
        delete outHeaders["transfer-encoding"];
        outHeaders["content-length"] = String(Buffer.byteLength(body));
        res.writeHead(proxyRes.statusCode ?? 502, outHeaders);
        res.end(body);
      });
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

  let transformResponse;
  try {
    const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    if (pathname === "/api/mcp/oauth/start") {
      transformResponse = (payload) => rewriteGoogleOAuthStartResponse(payload);
    }
  } catch {
    transformResponse = undefined;
  }

  forwardJson(
    req,
    res,
    backendUrl,
    JSON.stringify(result.body),
    transformResponse,
  );
  return true;
}

function writeCallbackUnavailable(res, status, message) {
  if (res.headersSent) return;
  const body = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>OAuth callback</title>
  </head>
  <body>
    <p>${message}</p>
    <p><a href="/mcp">Return to MCP marketplace</a></p>
  </body>
</html>`;
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

export function handleMcpOAuthPublicCallback(req, res, env = process.env) {
  if (!shouldProxyMcpOAuthPublicCallback(req)) return false;

  const port = getMcpOAuthCallbackPort(env);
  const incoming = new URL(req.url ?? "/", "http://localhost");
  const path = `/callback${incoming.search}`;
  const proxyReq = httpRequest(
    {
      hostname: "127.0.0.1",
      port,
      path,
      method: req.method,
      headers: {
        host: `127.0.0.1:${port}`,
        accept: req.headers.accept ?? "*/*",
        "user-agent": req.headers["user-agent"] ?? "starship-oauth-callback",
      },
      timeout: CALLBACK_PROXY_TIMEOUT_MS,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );
  proxyReq.on("timeout", () => {
    proxyReq.destroy();
    writeCallbackUnavailable(
      res,
      504,
      "OAuth callback timed out. Go back to /mcp and click Install again.",
    );
  });
  proxyReq.on("error", () => {
    writeCallbackUnavailable(
      res,
      503,
      "OAuth is not waiting for a callback. Go back to /mcp and click Install again.",
    );
  });
  proxyReq.end();
  return true;
}

/**
 * Langfuse OTLP Ingest Proxy
 *
 * Server-side proxy between the Grokbot frontend and the Langfuse OTLP
 * ingestion endpoint. The browser POSTs OTLP span payloads to the same
 * origin at `/api/observability/langfuse/otel`, and this proxy forwards
 * them to `${LANGFUSE_BASE_URL}/api/public/otel/v1/traces` with proper
 * Basic Auth using the server-side secret key.
 *
 * Why this exists:
 *   - The OTLP endpoint is a server-to-server API (no CORS headers).
 *   - The browser can't call it directly without hitting CORS preflight
 *     failures ("Failed to fetch").
 *   - The secret key stays server-side where it belongs.
 */

import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";

function getEnvConfig() {
  const publicKey = (
    process.env.LANGFUSE_PUBLIC_KEY ||
    process.env.VITE_LANGFUSE_PUBLIC_KEY ||
    ""
  ).trim();
  const secretKey = (
    process.env.LANGFUSE_SECRET_KEY ||
    process.env.VITE_LANGFUSE_SECRET_KEY ||
    ""
  ).trim();
  const baseUrl = (
    process.env.LANGFUSE_BASE_URL ||
    process.env.VITE_LANGFUSE_BASE_URL ||
    ""
  )
    .trim()
    .replace(/\/$/, "");

  return { publicKey, secretKey, baseUrl };
}

/**
 * Forward an OTLP span payload to Langfuse.
 */
function forwardToLangfuse(url, body, authHeader) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === "https:";
    const reqFn = isHttps ? httpsRequest : httpRequest;

    const payload = typeof body === "string" ? body : JSON.stringify(body);

    const req = reqFn(
      {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          "x-langfuse-ingestion-version": "4",
          "User-Agent": "Grokbot-Langfuse-Proxy/1.0.0",
        },
        timeout: 10000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          resolve({ statusCode: res.statusCode, raw });
        });
      },
    );

    req.on("error", (err) => reject(err));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Langfuse OTLP request timed out after 10s"));
    });

    req.write(payload);
    req.end();
  });
}

/**
 * Read the full request body as a string.
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/**
 * Handle incoming Langfuse proxy requests.
 *
 * Routes:
 *   POST /api/observability/langfuse/otel   — forward OTLP spans
 *   GET  /api/observability/langfuse/status  — config health check
 */
export async function handleLangfuseProxy(req, res, pathname) {
  const { publicKey, secretKey, baseUrl } = getEnvConfig();

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

  // ── Status endpoint ────────────────────────────────────────────────────
  if (pathname === "/api/observability/langfuse/status") {
    res.writeHead(200);
    res.end(
      JSON.stringify({
        enabled: Boolean(publicKey && baseUrl),
        hasPublicKey: Boolean(publicKey),
        hasSecretKey: Boolean(secretKey),
        baseUrl: baseUrl || null,
      }),
    );
    return;
  }

  // ── OTLP ingest proxy ─────────────────────────────────────────────────
  if (pathname === "/api/observability/langfuse/otel") {
    if (req.method !== "POST") {
      res.writeHead(405);
      res.end(JSON.stringify({ error: "Method Not Allowed" }));
      return;
    }

    if (!publicKey || !baseUrl) {
      // Langfuse not configured — silently accept and drop.
      // This prevents the client from erroring when Langfuse is disabled.
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, dropped: true }));
      return;
    }

    try {
      const body = await readBody(req);
      const authVal = secretKey ? `${publicKey}:${secretKey}` : `${publicKey}:`;
      const authHeader = `Basic ${Buffer.from(authVal).toString("base64")}`;

      const upstream = await forwardToLangfuse(
        `${baseUrl}/api/public/otel/v1/traces`,
        body,
        authHeader,
      );

      res.writeHead(upstream.statusCode);
      res.end(upstream.raw);
    } catch (err) {
      console.error("Langfuse OTLP proxy error:", err.message);
      res.writeHead(502);
      res.end(JSON.stringify({ error: "Langfuse upstream error", detail: err.message }));
    }
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: "Not Found" }));
}

import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { createProxyServer } from "httpxy";

const DEFAULT_PROXY_TIMEOUT_MS = 120_000;
const SERVER_INFO_PATH = "/server_info";
const BENIGN_SOCKET_ERRORS = new Set([
  "ECONNRESET",
  "EPIPE",
  "ECONNABORTED",
  "ERR_STREAM_PREMATURE_CLOSE",
]);

export function matchesPathPrefix(url, prefix) {
  return (
    url === prefix ||
    url.startsWith(prefix + "/") ||
    url.startsWith(prefix + "?")
  );
}

export function isAllowedCorsOrigin(origin) {
  if (!origin) return false;
  const configured = (process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (configured.includes("*") || configured.includes(origin)) return true;
  try {
    const parsed = new URL(origin);
    const host = parsed.hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".beenex.org") ||
      host.endsWith(".pages.dev")
    );
  } catch {
    return false;
  }
}

export function applyCorsHeaders(req, res) {
  const origin = req.headers?.origin;
  if (!origin || !isAllowedCorsOrigin(origin)) return;

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD",
  );
  const requestHeaders = req.headers?.["access-control-request-headers"];
  if (requestHeaders) {
    res.setHeader("Access-Control-Allow-Headers", requestHeaders);
  } else {
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Session-API-Key, X-Requested-With, Accept, Origin, Range, X-Expose-Secrets, X-Org-Id, X-OpenHands-Telemetry-Distinct-Id, X-OpenHands-Client-Version, X-OpenHands-Client-Name",
    );
  }
  res.setHeader(
    "Access-Control-Expose-Headers",
    "Content-Length, Content-Range, X-Session-API-Key, X-Expose-Secrets",
  );
  res.setHeader("Access-Control-Max-Age", "86400");
}

export function createRouter(routes, defaultBackend = null) {
  const sortedRoutes = Object.entries(routes).sort(
    ([a], [b]) => b.length - a.length,
  );

  return function route(url) {
    for (const [prefix, backend] of sortedRoutes) {
      if (matchesPathPrefix(url, prefix)) {
        return backend;
      }
    }
    return defaultBackend;
  };
}

export function isBenignSocketError(err) {
  return Boolean(err && BENIGN_SOCKET_ERRORS.has(err.code));
}

function parseBackendUrl(backendUrl) {
  const url = new URL(backendUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Invalid backend URL");
  }
  return {
    hostname: url.hostname,
    port: Number.parseInt(url.port, 10) || (url.protocol === "https:" ? 443 : 80),
    protocol: url.protocol,
  };
}

function writeInvalidBackendUrlResponse(req, res) {
  const message = "Invalid backend URL";
  console.error(`Proxy error for ${req.url}: ${message}`);
  if (!res.headersSent) {
    res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`Bad Gateway: ${message}`);
  } else {
    res.destroy();
  }
}

export function isServerInfoRequest(req) {
  const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
  return pathname === SERVER_INFO_PATH;
}

export function proxyServerInfoRequest(
  req,
  res,
  backendUrl,
  runtimeServicesInfo,
) {
  let backend;
  try {
    backend = parseBackendUrl(backendUrl);
  } catch {
    writeInvalidBackendUrlResponse(req, res);
    return;
  }

  const request = backend.protocol === "https:" ? httpsRequest : httpRequest;
  const proxyReq = request(
    {
      hostname: backend.hostname,
      port: backend.port,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        host: `${backend.hostname}:${backend.port}`,
      },
    },
    (proxyRes) => {
      const chunks = [];

      proxyRes.on("data", (chunk) => {
        chunks.push(Buffer.from(chunk));
      });

      proxyRes.on("error", (err) => {
        if (!isBenignSocketError(err)) {
          console.error(`Upstream response error for ${req.url}:`, err.message);
        }
        if (!res.headersSent) {
          res.writeHead(502);
          res.end(`Bad Gateway: ${err.message}`);
        } else {
          res.destroy();
        }
      });

      proxyRes.on("end", () => {
        const statusCode = proxyRes.statusCode ?? 502;
        const headers = { ...proxyRes.headers };
        const originalBody = Buffer.concat(chunks);

        if (statusCode < 200 || statusCode >= 300 || req.method === "HEAD") {
          res.writeHead(statusCode, headers);
          res.end(req.method === "HEAD" ? "" : originalBody);
          return;
        }

        try {
          const serverInfo = JSON.parse(originalBody.toString("utf8"));
          const runtimeServices =
            typeof runtimeServicesInfo === "string"
              ? JSON.parse(runtimeServicesInfo)
              : runtimeServicesInfo;
          const body = Buffer.from(
            JSON.stringify({
              ...serverInfo,
              runtime_services: runtimeServices,
            }),
            "utf8",
          );

          delete headers["content-length"];
          delete headers["transfer-encoding"];
          headers["content-type"] = "application/json; charset=utf-8";
          headers["cache-control"] = "no-store";
          res.writeHead(statusCode, headers);
          res.end(body);
        } catch (err) {
          console.warn(
            `Could not append runtime_services to ${SERVER_INFO_PATH}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
          res.writeHead(statusCode, headers);
          res.end(originalBody);
        }
      });
    },
  );

  proxyReq.on("error", (err) => {
    if (!isBenignSocketError(err)) {
      console.error(`Proxy error for ${req.url}:`, err.message);
    }
    if (!res.headersSent) {
      res.writeHead(502);
      res.end(`Bad Gateway: ${err.message}`);
    } else {
      res.destroy();
    }
  });

  req.on("error", (err) => {
    if (!isBenignSocketError(err)) {
      console.error(`Client request error for ${req.url}:`, err.message);
    }
    proxyReq.destroy();
  });

  res.on("error", (err) => {
    if (!isBenignSocketError(err)) {
      console.error(`Client response error for ${req.url}:`, err.message);
    }
    proxyReq.destroy();
  });

  req.pipe(proxyReq, { end: true });
}

function once(fn) {
  let called = false;
  return (...args) => {
    if (called) return;
    called = true;
    fn(...args);
  };
}

/**
 * Per-response override for the 502 body, stashed on the response object.
 *
 * httpxy surfaces upstream failures twice — once by rejecting the `proxy.web`
 * promise and once through the proxy-level "error" event — and the event
 * usually wins the race. Without somewhere shared to look, whichever fires
 * first writes a plain-text `Bad Gateway`, and the caller's nicer handler then
 * finds `headersSent` already true and silently does nothing.
 */
const ERROR_HANDLER = Symbol("proxyErrorHandler");

function writeProxyError(res, message) {
  if (res.destroyed) return;
  if (!res.headersSent) {
    const override = res[ERROR_HANDLER];
    if (override) {
      override(res);
      return;
    }
    res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`Bad Gateway: ${message}`);
    return;
  }
  res.destroy();
}

export function createProxyHandlers({
  label = "proxy",
  timeout = DEFAULT_PROXY_TIMEOUT_MS,
  proxyTimeout = DEFAULT_PROXY_TIMEOUT_MS,
} = {}) {
  const proxy = createProxyServer({
    ws: true,
    changeOrigin: true,
    xfwd: true,
    timeout,
    proxyTimeout,
  });
  const metrics = {
    activeHttpRequests: 0,
    activeWebSockets: 0,
    totalHttpRequests: 0,
    totalWebSockets: 0,
    totalErrors: 0,
  };

  proxy.on("error", (err, _req, resOrSocket, target) => {
    metrics.totalErrors += 1;
    const targetText = target ? ` -> ${target}` : "";
    if (!isBenignSocketError(err)) {
      console.error(`[${label}] Proxy error${targetText}: ${err.message}`);
    }
    if (resOrSocket && typeof resOrSocket.writeHead === "function") {
      writeProxyError(resOrSocket, err.message);
    } else if (resOrSocket && typeof resOrSocket.destroy === "function") {
      resOrSocket.destroy();
    }
  });

  proxy.on("proxyRes", (proxyRes, req, res) => {
    applyCorsHeaders(req, res);
  });

  /**
   * @param {Function} [onError] - Replaces the default plain-text 502 body.
   *   Used by the live-preview route, whose audience is whoever the user
   *   shared the link with, not a developer reading `Bad Gateway: ECONNREFUSED`.
   */
  function proxyHttp(req, res, target, onError) {
    if (onError) res[ERROR_HANDLER] = onError;
    metrics.activeHttpRequests += 1;
    metrics.totalHttpRequests += 1;
    const finish = once(() => {
      metrics.activeHttpRequests = Math.max(0, metrics.activeHttpRequests - 1);
    });
    res.on("close", finish);
    res.on("finish", finish);
    res.on("error", finish);

    const handleProxyError = (err) => {
      metrics.totalErrors += 1;
      if (!isBenignSocketError(err)) {
        console.error(
          `[${label}] Proxy error for ${req.url} -> ${target}:`,
          err,
        );
      }
      writeProxyError(res, err instanceof Error ? err.message : String(err));
      finish();
    };

    try {
      proxy.web(req, res, { target }).catch(handleProxyError);
    } catch (err) {
      handleProxyError(err);
    }
  }

  function proxyWebSocket(req, socket, head, target) {
    metrics.activeWebSockets += 1;
    metrics.totalWebSockets += 1;
    const finish = once(() => {
      metrics.activeWebSockets = Math.max(0, metrics.activeWebSockets - 1);
    });
    socket.on("close", finish);
    socket.on("error", finish);

    try {
      proxy.ws(req, socket, { target }, head).catch((err) => {
        metrics.totalErrors += 1;
        if (!isBenignSocketError(err)) {
          console.error(
            `[${label}] WebSocket proxy error for ${req.url} -> ${target}:`,
            err,
          );
        }
        socket.destroy();
        finish();
      });
    } catch (err) {
      metrics.totalErrors += 1;
      if (!isBenignSocketError(err)) {
        console.error(
          `[${label}] WebSocket proxy error for ${req.url} -> ${target}:`,
          err,
        );
      }
      socket.destroy();
      finish();
    }
  }

  function dumpMetrics() {
    console.log(
      `[${label}] active_http=${metrics.activeHttpRequests} ` +
        `active_ws=${metrics.activeWebSockets} ` +
        `total_http=${metrics.totalHttpRequests} ` +
        `total_ws=${metrics.totalWebSockets} ` +
        `total_errors=${metrics.totalErrors}`,
    );
  }

  function installDiagnostics(signal = "SIGUSR1") {
    process.on(signal, dumpMetrics);
    return () => {
      process.off(signal, dumpMetrics);
    };
  }

  return {
    proxyHttp,
    proxyWebSocket,
    dumpMetrics,
    installDiagnostics,
    metrics,
  };
}

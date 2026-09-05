/**
 * Combined static file server + reverse proxy.
 *
 * Replaces `sirv-cli` for the static launcher. The reason a plain static
 * server is not enough: Vite's dev server (used by `npm run dev`) configures
 * a proxy for `/api`, `/sockets`, `/server_info`, `/alive`, `/health`,
 * `/ready`, `/docs`, `/redoc`, `/openapi.json` (see vite.config.ts) so
 * requests to those paths are forwarded to
 * the agent-server even when the browser is hitting Vite directly on :3001.
 * sirv-cli has no proxy support, so under `--single` it falls back to
 * index.html for any of those paths — making `/server_info` look like HTML
 * to the SPA when the user hits the static port directly (e.g. via a tunnel
 * that exposes :3001).
 *
 * This script provides Vite-equivalent behaviour: serve static files from
 * --dir, fall back to index.html for HTML navigations, and reverse-proxy
 * configured prefixes to upstream backends. The proxy + WebSocket logic is
 * deliberately kept identical in spirit to scripts/ingress.mjs so the two
 * servers route the same way.
 *
 * Usage (mirrors scripts/ingress.mjs's --route flag style):
 *   node scripts/static-server.mjs \
 *     --port 3001 --dir build \
 *     --route "/api/automation=http://localhost:18001" \
 *     --route "/api=http://localhost:18000" \
 *     --route "/server_info=http://localhost:18000" \
 *     --route "/sockets=http://localhost:18000"
 */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import sirv from "sirv";

import {
  applyCorsHeaders,
  createProxyHandlers,
  createRouter,
  isServerInfoRequest,
  matchesPathPrefix,
  proxyServerInfoRequest,
} from "./proxy-utils.mjs";
import { handleDatadogProxy } from "./datadog-proxy.mjs";
import { handlePostHogProxy } from "./posthog-proxy.mjs";
import { handleCodexUsageProxy } from "./codex-usage-proxy.mjs";
import { handleClaudeUsageProxy } from "./claude-usage-proxy.mjs";
import { handleCursorApiProxy } from "./cursor-api-proxy.mjs";
import { handleOpencodeApiProxy } from "./opencode-api-proxy.mjs";
import {
  DEFAULT_BLOCKED_PORTS,
  captureInfrastructurePorts,
  createPreviewHostMatcher,
  listListeningPorts,
  writePreviewUnavailable,
  writeAppNotFound,
} from "./preview-proxy.mjs";
import {
  listApps,
  registerApp,
  registerStaticApp,
  unregisterApp,
  getApp,
  startApp,
  stopApp,
  scanAndDiscoverApps,
  getAppLogs,
  checkPortListening,
  DEFAULT_REGISTRY_PATH,
} from "./app-registry.mjs";
import {
  handleJobBoardRequest,
  startJobBoardDispatcher,
} from "./job-board.mjs";

/** Where the frontend reads the live-preview state from. */
const PREVIEW_PORTS_PATH = "/api/preview/ports";
/** Where apps are registered and listed. */
const PREVIEW_APPS_PATH = "/api/preview/apps";
/** Persistent workforce kanban. */
const JOBS_API_PREFIX = "/api/jobs";

// ─────────────────────────────────────────────────────────────────────────────
// SPA fallback helpers
// ─────────────────────────────────────────────────────────────────────────────

const ASSET_LIKE_EXTENSIONS = new Set([
  ".br",
  ".css",
  ".gif",
  ".gz",
  ".html",
  ".htm",
  ".ico",
  ".jpeg",
  ".jpg",
  ".js",
  ".json",
  ".map",
  ".mjs",
  ".mp3",
  ".png",
  ".svg",
  ".ttf",
  ".txt",
  ".wav",
  ".webmanifest",
  ".webp",
  ".woff",
  ".woff2",
  ".xml",
]);

// ─────────────────────────────────────────────────────────────────────────────
// Args
// ─────────────────────────────────────────────────────────────────────────────

export function parseArgs(argv = process.argv.slice(2)) {
  const config = {
    port: 3001,
    host: "::",
    dir: "build",
    routes: {},
    rejectPrefixes: [],
    sessionApiKey: null,
    authRequired: false,
    runtimeServicesInfo: null,
    lockToCloud: null,
    basePath: "/",
    previewHostPattern: null,
    previewUrlScheme: "https",
    previewBlockedPorts: [...DEFAULT_BLOCKED_PORTS],
    appsRegistryPath: DEFAULT_REGISTRY_PATH,
  };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    switch (flag) {
      case "-p":
      case "--port":
        config.port = Number.parseInt(argv[++i], 10);
        break;
      case "-H":
      case "--host":
        config.host = argv[++i];
        break;
      case "-d":
      case "--dir":
        config.dir = argv[++i];
        break;
      case "--apps-registry-path":
        config.appsRegistryPath = argv[++i] || DEFAULT_REGISTRY_PATH;
        break;
      case "-r":
      case "--route": {
        const value = argv[++i];
        const eq = value.indexOf("=");
        if (eq < 0) {
          throw new Error(`Invalid --route (expected /prefix=url): ${value}`);
        }
        const prefix = value.slice(0, eq);
        const url = value.slice(eq + 1);
        if (!prefix.startsWith("/")) {
          throw new Error(`--route prefix must start with '/': ${prefix}`);
        }
        config.routes[prefix] = url;
        break;
      }
      case "--session-api-key":
        config.sessionApiKey = argv[++i] || null;
        break;
      case "--runtime-services-info":
        config.runtimeServicesInfo = argv[++i] || null;
        break;
      case "--lock-to-cloud":
        config.lockToCloud = argv[++i] || null;
        break;
      case "--base-path":
        config.basePath = normalizeBasePath(argv[++i]);
        break;
      case "--preview-host-pattern":
        config.previewHostPattern = argv[++i] || null;
        break;
      case "--preview-url-scheme":
        config.previewUrlScheme = argv[++i] || "https";
        break;
      case "--preview-block-port": {
        const port = Number.parseInt(argv[++i], 10);
        if (Number.isInteger(port)) config.previewBlockedPorts.push(port);
        break;
      }

      case "--auth-required":
        config.authRequired = true;
        break;
      case "--reject-prefix": {
        const prefix = argv[++i];
        if (!prefix || !prefix.startsWith("/")) {
          throw new Error(
            `--reject-prefix value must start with '/': ${prefix ?? "(empty)"}`,
          );
        }
        config.rejectPrefixes.push(prefix);
        break;
      }
      case "-h":
      case "--help":
        showHelp();
        process.exit(0);
      default:
        throw new Error(`Unknown flag: ${flag}`);
    }
  }

  // Guard: --session-api-key and --auth-required are semantically
  // mutually exclusive. The first auto-injects the key (local mode);
  // the second forces the user to paste it (public mode). Combining
  // both is a misconfiguration.
  if (config.sessionApiKey && config.authRequired) {
    console.error(
      "ERROR: --session-api-key and --auth-required are mutually exclusive.\n" +
        "  Use --session-api-key for local mode (key auto-injected).\n" +
        "  Use --auth-required for public mode (user pastes key).",
    );
    process.exit(1);
  }

  return config;
}

function normalizeBasePath(value) {
  const raw = (value ?? "").trim();
  if (!raw || raw === "/") return "/";

  const withLeadingSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withLeadingSlash.replace(/\/+$/, "");
}

function showHelp() {
  console.log(`
Combined static file server + reverse proxy.

USAGE:
  node scripts/static-server.mjs [options]

OPTIONS:
  -p, --port  <port>           Port to bind (default: 3001)
  -H, --host  <host>           Hostname to bind (default: :: dual-stack)
  -d, --dir   <dir>            Directory to serve (default: build)
  -r, --route <prefix=url>     Proxy <prefix> (and subpaths) to <url>;
                               may be repeated. WebSockets supported.
  --session-api-key <key>      Inject session API key into index.html so the
                               pre-built frontend authenticates to agent-server
                               without needing VITE_SESSION_API_KEY baked in.
  --auth-required              Inject authRequired flag into index.html so the
                               pre-built frontend shows the API key entry screen
                               (public mode) without VITE_AUTH_REQUIRED baked in.
  --runtime-services-info <json>
                               Inject a JSON description of the local runtime
                               services into index.html so the pre-built
                               frontend can populate the agent's
                               <RUNTIME_SERVICES> system-prompt block without
                               VITE_RUNTIME_SERVICES_INFO baked in.
  --lock-to-cloud <cloud-url>  Lock backend setup to a single OpenHands Cloud
                               URL. Hides manual/local backend setup and the
                               custom Cloud URL field in the pre-built frontend.
  --base-path <path>           Mount the SPA under <path> (default: /).
                               For example, --base-path /canvas serves
                               index.html and assets under /canvas.
  --reject-prefix <prefix>     Return 503 for requests matching <prefix>
                               instead of SPA-fallbacking to index.html;
                               may be repeated. Useful in --frontend-only
                               mode to cleanly reject API paths.
  --preview-host-pattern <pat> Enable live app preview. Requests whose Host
                               matches <pat> (which must contain '{port}',
                               e.g. 'p{port}.beenex.org') are proxied 1:1 to
                               127.0.0.1:<port>, with no path rewriting.
                               Requires a DNS record + proxy route per host.
  --preview-url-scheme <s>     Scheme for advertised preview URLs
                               (default: https — TLS usually terminates at an
                               upstream CDN while the origin speaks http).
  --preview-block-port <port>  Never proxy this port, even if it matches the
                               host pattern; may be repeated. The stack's own
                               ports (${DEFAULT_BLOCKED_PORTS.join(", ")}) are always blocked.
  -h, --help                   Show this help

ROUTING:
  • Routes are matched by longest prefix first (most-specific wins).
  • Reject prefixes are checked before SPA fallback — matching requests
    get 503 immediately.
  • Anything that does not match a route or reject prefix is served
    from --dir.
  • Unknown paths fall back to index.html (SPA mode), unless they look
    like an asset request (have a known file extension), in which case
    a 404 is returned.
`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Runtime config injection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a tiny inline script that seeds runtime config into the page.
 *
 * - `sessionApiKey`: exposed to the app two ways so a fresh-localStorage
 *   browser can authenticate even though the published bundle has no
 *   VITE_SESSION_API_KEY baked in:
 *     1. `window.__AGENT_CANVAS_SESSION_API_KEY__` — read by
 *        `getBakedSessionApiKey()` in `agent-server-config.ts` as a fallback
 *        when the env var is empty. This is symmetric with how
 *        `__AGENT_CANVAS_AUTH_REQUIRED__` works for the auth-required flag.
 *     2. Written to `openhands-agent-server-config.sessionApiKey` in
 *        localStorage for compatibility with the legacy storage key. Useful
 *        for any code path that still reads it (e.g. e2e test fixtures).
 *        Always overwrites when the stored value differs so a rotated key
 *        is not shadowed by a stale one.
 *
 * - `authRequired`: sets `window.__AGENT_CANVAS_AUTH_REQUIRED__ = true` so the
 *   pre-built frontend shows the API key entry screen (public mode) without
 *   VITE_AUTH_REQUIRED baked in.
 *
 * - `runtimeServicesInfo`: a JSON string describing the local services
 *   (agent-server, automation, …), exposed as
 *   `window.__AGENT_CANVAS_RUNTIME_SERVICES_INFO__`. Read by
 *   `parseRuntimeServicesInfo()` in `agent-server-adapter.ts` as a fallback
 *   when `VITE_RUNTIME_SERVICES_INFO` is empty, so static builds (Docker /
 *   published binary) still populate the agent's `<RUNTIME_SERVICES>` block.
 *
 * - `lockToCloud`: an OpenHands Cloud URL exposed as
 *   `window.__AGENT_CANVAS_LOCK_TO_CLOUD__`. Read by `getLockedCloudHost()` in
 *   `agent-server-config.ts` so pre-built frontend bundles can hide manual
 *   backend setup and the custom Cloud URL field at runtime.
 *
 * - `basePath`: the path prefix the SPA is mounted under, exposed as
 *   `window.__AGENT_CANVAS_BASE_PATH__` so runtime static assets like locale
 *   files can resolve through the same subpath as the built bundle.
 */
function makeConfigInjectionScript(
  sessionApiKey,
  authRequired,
  runtimeServicesInfo,
  lockToCloud,
  basePath,
) {
  const parts = [];

  if (sessionApiKey) {
    const keyLiteral = JSON.stringify(sessionApiKey);
    // Window global — read at module init by getBakedSessionApiKey().
    // Set first so it's available even if the localStorage write throws.
    parts.push(`window.__AGENT_CANVAS_SESSION_API_KEY__=${keyLiteral};`);
    // Always overwrite when the stored key differs from the runtime key.
    // A previous session may have persisted a now-stale key; the runtime
    // value (from --session-api-key) is the server's truth.
    parts.push(
      `try{` +
        `var _k='openhands-agent-server-config',` +
        `_c=JSON.parse(localStorage.getItem(_k)||'{}');` +
        `if(_c.sessionApiKey!==${keyLiteral}){` +
        `_c.sessionApiKey=${keyLiteral};` +
        `localStorage.setItem(_k,JSON.stringify(_c));` +
        `}` +
        `}catch(e){}`,
    );
  }

  if (authRequired) {
    parts.push(`window.__AGENT_CANVAS_AUTH_REQUIRED__=true;`);
  }

  if (runtimeServicesInfo) {
    // Stored as the raw JSON string so the browser-side parser
    // (parseRuntimeServicesInfo) can JSON.parse it exactly like the
    // VITE_RUNTIME_SERVICES_INFO env var. JSON.stringify produces a safe JS
    // string literal for the inline <script>.
    parts.push(
      `window.__AGENT_CANVAS_RUNTIME_SERVICES_INFO__=${JSON.stringify(runtimeServicesInfo)};`,
    );
  }

  if (lockToCloud) {
    parts.push(
      `window.__AGENT_CANVAS_LOCK_TO_CLOUD__=${JSON.stringify(lockToCloud)};`,
    );
  }

  if (basePath && basePath !== "/") {
    parts.push(
      `window.__AGENT_CANVAS_BASE_PATH__=${JSON.stringify(basePath)};`,
    );
  }

  // Observability backend config — injected from runtime env vars so the
  // pre-built bundle can reach Opik, Langwatch, etc. without needing the
  // keys baked in at Vite build time.
  const obsConfig = {};
  const obsKeys = [
    "VITE_OPIK_API_KEY",
    "VITE_OPIK_BASE_URL",
    "VITE_OPIK_WORKSPACE",
    "VITE_LANGWATCH_API_KEY",
    "VITE_LANGWATCH_BASE_URL",
    "VITE_POSTHOG_AI_ENABLED",
    "VITE_POSTHOG_API_KEY",
    "POSTHOG_API_KEY",
    "VITE_POSTHOG_HOST",
    "POSTHOG_HOST",
    "VITE_POSTHOG_UI_HOST",
    "VITE_RAINDROP_WRITE_KEY",
    "RAINDROP_WRITE_KEY",
    "VITE_RAINDROP_PROJECT_ID",
    "RAINDROP_PROJECT_ID",
    "VITE_RAINDROP_BASE_URL",
    // Datadog credentials — injected so the Settings > Observability
    // credentials view can show "Configured (env)" status.
    // NOTE: Only the existence is checked client-side, not the values.
    "DD_API_KEY",
    "DD_APP_KEY",
    "DD_SITE",
    "VITE_DD_SITE",
    "VITE_DD_APPLICATION_ID",
    "VITE_DD_CLIENT_TOKEN",
    // Langfuse credentials
    "LANGFUSE_PUBLIC_KEY",
    "VITE_LANGFUSE_PUBLIC_KEY",
    "LANGFUSE_SECRET_KEY",
    "VITE_LANGFUSE_SECRET_KEY",
    "LANGFUSE_BASE_URL",
    "VITE_LANGFUSE_BASE_URL",
  ];
  for (const key of obsKeys) {
    if (process.env[key]) obsConfig[key] = process.env[key];
  }
  if (Object.keys(obsConfig).length > 0) {
    parts.push(`window.__OBSERVABILITY_CONFIG__=${JSON.stringify(obsConfig)};`);
  }

  // Auto-grant telemetry consent for self-hosted instances.
  // When the operator sets VITE_TELEMETRY_AUTO_CONSENT=true, pre-populate
  // the consent key in localStorage so PostHog AI and other telemetry
  // backends work immediately without requiring the user to dismiss a
  // consent banner. Safe because the operator owns all data.
  if (process.env.VITE_TELEMETRY_AUTO_CONSENT === "true") {
    parts.push(
      `try{if(!localStorage.getItem("openhands-telemetry-consent"))` +
        `{localStorage.setItem("openhands-telemetry-consent","granted");}}catch(e){}`,
    );
  }

  if (parts.length === 0) return "";

  return `<script>(function(){${parts.join("")}}());</script>`;
}

/**
 * Serve index.html with runtime config injected into <head>.
 * Returns true if the response was written, false if the file was not found.
 */
async function serveInjectedIndexHtml(
  req,
  res,
  indexPath,
  {
    sessionApiKey,
    authRequired,
    runtimeServicesInfo,
    lockToCloud,
    basePath,
  } = {},
) {
  let content;
  try {
    content = await readFile(indexPath, "utf8");
  } catch {
    return false;
  }

  const script = makeConfigInjectionScript(
    sessionApiKey,
    authRequired,
    runtimeServicesInfo,
    lockToCloud,
    basePath,
  );
  // Inject right before </head> so the key is available before any app code runs.
  // replace() targets the first (and only) </head> in well-formed HTML.
  const injected = content.includes("</head>")
    ? content.replace("</head>", `${script}\n</head>`)
    : content.includes("</body>")
      ? content.replace("</body>", `${script}\n</body>`)
      : script + content;

  const buf = Buffer.from(injected, "utf8");
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": buf.length,
    "Cache-Control":
      "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  });
  if (req.method === "HEAD") {
    res.end();
  } else {
    res.end(buf);
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Static file serving
// ─────────────────────────────────────────────────────────────────────────────

function parseUrlPath(req, res) {
  const rawPath = (req.url ?? "/").split("?")[0];
  try {
    return decodeURIComponent(rawPath);
  } catch {
    res.writeHead(400);
    res.end("Bad Request");
    return null;
  }
}

function isGetOrHead(req) {
  return req.method === "GET" || req.method === "HEAD";
}

function needsRuntimeInjection(injectionOpts) {
  return Boolean(
    injectionOpts.sessionApiKey ||
    injectionOpts.authRequired ||
    injectionOpts.runtimeServicesInfo ||
    injectionOpts.lockToCloud ||
    (injectionOpts.basePath && injectionOpts.basePath !== "/"),
  );
}

function looksLikeAssetRequest(urlPath) {
  const last = urlPath.split("/").pop() ?? "";
  return ASSET_LIKE_EXTENSIONS.has(extname(last).toLowerCase());
}

function matchesAnyPrefix(urlPath, prefixes) {
  return prefixes.some((prefix) => matchesPathPrefix(urlPath, prefix));
}

function rejectUnavailable(res) {
  res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Service Unavailable (no backend configured for this route)");
}

function notFound(res) {
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not Found");
}

function isMountedPath(urlPath, basePath) {
  return (
    basePath === "/" ||
    urlPath === basePath ||
    urlPath.startsWith(`${basePath}/`)
  );
}

function stripBasePathFromUrl(rawUrl, basePath) {
  if (basePath === "/") return rawUrl;

  const [rawPath = "/", ...rest] = (rawUrl || "/").split("?");
  const suffix = rawPath.slice(basePath.length) || "/";
  const path = suffix.startsWith("/") ? suffix : `/${suffix}`;
  return rest.length > 0 ? `${path}?${rest.join("?")}` : path;
}

function redirectToMountedPath(req, res, urlPath, basePath) {
  if (basePath === "/" || !isGetOrHead(req) || looksLikeAssetRequest(urlPath)) {
    return false;
  }

  const [, query = ""] = (req.url ?? "/").split("?", 2);
  const path = urlPath === "/" ? "/" : urlPath;
  const location = `${basePath}${path}${query ? `?${query}` : ""}`;
  res.writeHead(308, { Location: location });
  res.end();
  return true;
}

function setStaticHeaders(res, pathname) {
  const extension = extname(pathname).toLowerCase();
  if (extension === ".js" || extension === ".mjs") {
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  }

  if (pathname.startsWith("/assets/")) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return;
  }
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
}

function createStaticMiddleware(dirAbs) {
  return sirv(dirAbs, {
    etag: true,
    single: false,
    setHeaders: setStaticHeaders,
  });
}

async function handleStatic(
  req,
  res,
  dirAbs,
  staticMiddleware,
  injectionOpts = {},
  rejectPrefixes = [],
  basePath = "/",
) {
  const urlPath = parseUrlPath(req, res);
  if (urlPath === null) return;

  if (!isMountedPath(urlPath, basePath)) {
    if (matchesAnyPrefix(urlPath, rejectPrefixes)) {
      rejectUnavailable(res);
      return;
    }
    if (!redirectToMountedPath(req, res, urlPath, basePath)) notFound(res);
    return;
  }

  const mountedUrl = stripBasePathFromUrl(req.url ?? "/", basePath);
  const mountedPath = parseUrlPath({ ...req, url: mountedUrl }, res);
  if (mountedPath === null) return;

  const injectRuntimeConfig = needsRuntimeInjection(injectionOpts);
  const indexPath = resolve(dirAbs, "index.html");

  if (
    injectRuntimeConfig &&
    isGetOrHead(req) &&
    (mountedPath === "/" || mountedPath === "/index.html")
  ) {
    if (await serveInjectedIndexHtml(req, res, indexPath, injectionOpts))
      return;
  }

  const mountedReq = Object.create(req);
  mountedReq.url = mountedUrl;

  staticMiddleware(mountedReq, res, async () => {
    if (matchesAnyPrefix(mountedPath, rejectPrefixes)) {
      rejectUnavailable(res);
      return;
    }

    if (isGetOrHead(req) && !looksLikeAssetRequest(mountedPath)) {
      if (await serveInjectedIndexHtml(req, res, indexPath, injectionOpts)) {
        return;
      }
    }

    notFound(res);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Live app preview
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Report what the frontend needs to render the preview picker:
 *
 *   listening — ports with a server answering on them right now, discovered
 *               from /proc. This is "what the agent started".
 *   template  — how to turn a port into a URL, so the share link is built from
 *               deploy-time config rather than guessed in the browser.
 *
 * Every listening port is previewable: the proxy route matches the hostname by
 * pattern, so there is no per-port registration and therefore no such thing as
 * a running-but-unreachable port.
 */
async function handlePreviewPortsRequest(
  res,
  config,
  blockedPorts,
  infrastructurePorts,
) {
  const enabled = Boolean(
    config.previewHostPattern?.includes("{port}") ||
      config.previewHostPattern?.includes("{app}"),
  );
  const listening = await listListeningPorts(
    blockedPorts,
    undefined,
    infrastructurePorts,
  );

  const body = JSON.stringify({
    enabled,
    listening,
    urlTemplate: enabled
      ? `${config.previewUrlScheme}://${config.previewHostPattern}`
      : null,
  });

  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

async function handlePreviewAppsRequest(
  req,
  res,
  registryPath,
  blockedPorts = [],
  infrastructurePorts = new Set(),
) {
  applyCorsHeaders(req, res);
  const parsedUrl = new URL(req.url ?? "/", "http://localhost");

  if (req.method === "GET") {
    // 1. Check if requesting logs for an app: /api/preview/apps?action=logs&name=... or ?name=...&logs=true
    const logsAction = parsedUrl.searchParams.get("action") === "logs" || parsedUrl.searchParams.get("logs") === "true";
    const logAppName = parsedUrl.searchParams.get("name");
    if (logsAction && logAppName) {
      const tail = Number.parseInt(parsedUrl.searchParams.get("tail") || "100", 10);
      try {
        const logData = await getAppLogs(logAppName, tail, registryPath);
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(JSON.stringify({ success: true, ...logData }));
      } catch (err) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    const rawApps = await listApps(registryPath);
    let procListening = [];
    try {
      procListening = await listListeningPorts(
        blockedPorts,
        undefined,
        infrastructurePorts,
      );
    } catch {}

    const listeningSet = new Set(procListening);
    const registeredPorts = new Set();

    // Check dynamic app ports in parallel with fast TCP probe
    const apps = await Promise.all(
      rawApps.map(async (app) => {
        if (app.type === "static") {
          return {
            ...app,
            is_listening: true, // Edge hosted
            url_space: app.url,
            url_org: app.url,
          };
        }

        registeredPorts.add(app.port);
        let isListening = listeningSet.has(app.port);
        // Fallback TCP probe for macOS / non-Linux or edge socket situations
        if (!isListening && app.port) {
          isListening = await checkPortListening(app.port);
          if (isListening) listeningSet.add(app.port);
        }

        return {
          ...app,
          type: "dynamic",
          is_listening: isListening,
          url_space: `https://${app.name}.beenex.space`,
          url_org: `https://${app.name}.beenex.org`,
          url_port: `https://p${app.port}.beenex.org`,
        };
      }),
    );

    const allListening = [...listeningSet].sort((a, b) => a - b);
    const unassignedPorts = allListening.filter((p) => !registeredPorts.has(p));

    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify({ apps, listening: allListening, unassignedPorts }));
    return;
  }

  if (req.method === "POST") {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body || "{}");
        const { action, name } = payload;

        if (action === "scan" || action === "discover") {
          const discovered = await scanAndDiscoverApps(registryPath);
          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
          });
          res.end(JSON.stringify({ success: true, count: discovered.length, discovered }));
          return;
        }

        if (action === "start") {
          if (!name) throw new Error("Missing app name for start action");
          const result = await startApp(name, registryPath);
          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
          });
          res.end(JSON.stringify({ success: true, ...result }));
          return;
        }

        if (action === "stop") {
          if (!name) throw new Error("Missing app name for stop action");
          const result = await stopApp(name, registryPath);
          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
          });
          res.end(JSON.stringify({ success: true, ...result }));
          return;
        }

        if (action === "logs") {
          if (!name) throw new Error("Missing app name for logs action");
          const logData = await getAppLogs(name, payload.tail || 100, registryPath);
          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
          });
          res.end(JSON.stringify({ success: true, ...logData }));
          return;
        }

        let record;
        if (payload.type === "static" || payload.provider === "cloudflare_pages" || payload.url) {
          record = await registerStaticApp(payload, registryPath);
        } else {
          record = await registerApp(payload, registryPath, blockedPorts);
        }

        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
        });
        res.end(JSON.stringify({ success: true, app: record }));
      } catch (err) {
        res.writeHead(400, {
          "Content-Type": "application/json; charset=utf-8",
        });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  if (req.method === "DELETE") {
    const name = parsedUrl.searchParams.get("name");
    if (!name) {
      res.writeHead(400, {
        "Content-Type": "application/json; charset=utf-8",
      });
      res.end(JSON.stringify({ success: false, error: "Missing ?name=" }));
      return;
    }
    const success = await unregisterApp(name, registryPath, true);
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
    });
    res.end(JSON.stringify({ success, name }));
    return;
  }

  res.writeHead(405);
  res.end();
}

// ─────────────────────────────────────────────────────────────────────────────
// Server
// ─────────────────────────────────────────────────────────────────────────────

export function startStaticServer(config) {
  const route = createRouter(config.routes);
  const proxy = createProxyHandlers({ label: `static:${config.port}` });
  const dirAbs = resolve(config.dir);
  const injectionOpts = {
    sessionApiKey: config.sessionApiKey || null,
    authRequired: config.authRequired || false,
    runtimeServicesInfo: config.runtimeServicesInfo || null,
    lockToCloud: config.lockToCloud || null,
    basePath: normalizeBasePath(config.basePath),
  };
  const basePath = injectionOpts.basePath;
  const rejectPrefixes = config.rejectPrefixes ?? [];
  const staticMiddleware = createStaticMiddleware(dirAbs);

  const blockedPreviewPorts =
    config.previewBlockedPorts ?? DEFAULT_BLOCKED_PORTS;
  const previewPortForHost = createPreviewHostMatcher(
    config.previewHostPattern,
    blockedPreviewPorts,
    (appName) => getApp(appName, config.appsRegistryPath),
  );
  // Filled in just below, before the server accepts its first connection.
  let infrastructurePorts = new Set();

  const uninstallDiagnostics = proxy.installDiagnostics();

  const server = createServer(async (req, res) => {
    // Live app preview is matched on Host before anything else: a preview
    // hostname must never fall through to the canvas SPA, its API routes, or
    // the static handler, all of which are keyed on path alone.
    if (previewPortForHost) {
      try {
        const preview = await previewPortForHost(req.headers.host);
        if (preview !== null) {
          if (preview.port !== null && preview.port !== undefined) {
            proxy.proxyHttp(
              req,
              res,
              `http://127.0.0.1:${preview.port}`,
              (errorRes) =>
                writePreviewUnavailable(
                  errorRes,
                  preview.port,
                  preview.appName,
                ),
            );
            return;
          }
          if (preview.notFound && preview.appName) {
            await writeAppNotFound(res, preview.appName);
            return;
          }
        }
      } catch (err) {
        console.error("Preview host match error:", err);
      }
    }

    applyCorsHeaders(req, res);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url ?? "/", "http://localhost");

    if (parsedUrl.pathname === PREVIEW_PORTS_PATH) {
      handlePreviewPortsRequest(
        res,
        config,
        blockedPreviewPorts,
        infrastructurePorts,
      ).catch((err) => {
        console.error("Preview ports error:", err);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    if (parsedUrl.pathname === JOBS_API_PREFIX || parsedUrl.pathname.startsWith(`${JOBS_API_PREFIX}/`)) {
      const agentServerUrl =
        config.routes["/api"] ||
        process.env.GROKBOT_AGENT_SERVER_URL ||
        "http://127.0.0.1:18000";
      handleJobBoardRequest(req, res, {
        sessionApiKey: config.sessionApiKey,
        agentServerUrl,
      }).catch((err) => {
        console.error("Job board error:", err);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    if (parsedUrl.pathname === PREVIEW_APPS_PATH) {
      handlePreviewAppsRequest(
        req,
        res,
        config.appsRegistryPath,
        blockedPreviewPorts,
        infrastructurePorts,
      ).catch((err) => {
          console.error("Preview apps error:", err);
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: err.message }));
          }
        },
      );
      return;
    }

    if (parsedUrl.pathname.startsWith("/api/observability/datadog")) {
      const query = Object.fromEntries(parsedUrl.searchParams.entries());
      handleDatadogProxy(req, res, parsedUrl.pathname, query).catch((err) => {
        console.error("Datadog proxy error:", err);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    if (parsedUrl.pathname.startsWith("/api/observability/posthog")) {
      const query = Object.fromEntries(parsedUrl.searchParams.entries());
      handlePostHogProxy(req, res, parsedUrl.pathname, query).catch((err) => {
        console.error("PostHog proxy error:", err);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    if (parsedUrl.pathname.startsWith("/api/observability/codex")) {
      const query = Object.fromEntries(parsedUrl.searchParams.entries());
      handleCodexUsageProxy(req, res, parsedUrl.pathname, query).catch(
        (err) => {
          console.error("Codex usage proxy error:", err);
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: err.message }));
          }
        },
      );
      return;
    }

    if (parsedUrl.pathname.startsWith("/api/observability/claude")) {
      const query = Object.fromEntries(parsedUrl.searchParams.entries());
      handleClaudeUsageProxy(req, res, parsedUrl.pathname, query).catch(
        (err) => {
          console.error("Claude usage proxy error:", err);
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: err.message }));
          }
        },
      );
      return;
    }

    if (parsedUrl.pathname.startsWith("/api/observability/cursor")) {
      const query = Object.fromEntries(parsedUrl.searchParams.entries());
      handleCursorApiProxy(req, res, parsedUrl.pathname, query).catch((err) => {
        console.error("Cursor API proxy error:", err);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    if (parsedUrl.pathname.startsWith("/api/observability/opencode")) {
      const query = Object.fromEntries(parsedUrl.searchParams.entries());
      handleOpencodeApiProxy(req, res, parsedUrl.pathname, query).catch((err) => {
        console.error("OpenCode API proxy error:", err);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    const backend = route(req.url ?? "/");
    if (backend) {
      if (
        config.runtimeServicesInfo &&
        isServerInfoRequest(req) &&
        (req.method === "GET" || req.method === "HEAD")
      ) {
        proxyServerInfoRequest(req, res, backend, config.runtimeServicesInfo);
        return;
      }
      proxy.proxyHttp(req, res, backend);
      return;
    }
    handleStatic(
      req,
      res,
      dirAbs,
      staticMiddleware,
      injectionOpts,
      rejectPrefixes,
      basePath,
    ).catch((err) => {
      console.error(`Static handler error for ${req.url}:`, err);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end("Internal Server Error");
      }
    });
  });

  server.on("upgrade", async (req, socket, head) => {
    // Same Host-first ordering as the request handler — without this, a
    // previewed app's WebSocket (Vite HMR, most notably) would be matched
    // against the canvas route table and dropped.
    if (previewPortForHost) {
      try {
        const preview = await previewPortForHost(req.headers.host);
        if (preview?.port !== null && preview?.port !== undefined) {
          proxy.proxyWebSocket(
            req,
            socket,
            head,
            `http://127.0.0.1:${preview.port}`,
          );
          return;
        }
      } catch (err) {
        console.error("Preview upgrade host match error:", err);
      }
    }

    const backend = route(req.url ?? "/");
    if (backend) {
      proxy.proxyWebSocket(req, socket, head, backend);
      return;
    }
    socket.destroy();
  });
  server.on("close", uninstallDiagnostics);

  return new Promise((resolveListen) => {
    server.listen(config.port, config.host, async () => {
      if (previewPortForHost) {
        infrastructurePorts =
          await captureInfrastructurePorts(blockedPreviewPorts);
      }
      const displayPath = basePath === "/" ? "/" : `${basePath}/`;
      console.log("");
      console.log(
        `Static-server + proxy listening on http://${config.host}:${config.port}${displayPath}`,
      );
      console.log(`  Static dir: ${dirAbs}`);
      console.log(`  Base path: ${basePath}`);
      const sortedRoutes = Object.entries(config.routes).sort(
        ([a], [b]) => b.length - a.length,
      );
      for (const [prefix, backend] of sortedRoutes) {
        console.log(`  ${prefix} -> ${backend}`);
      }
      if (rejectPrefixes.length > 0) {
        for (const prefix of rejectPrefixes) {
          console.log(`  ${prefix} -> 503 (rejected)`);
        }
      }
      if (previewPortForHost) {
        console.log(
          `  ${config.previewUrlScheme}://${config.previewHostPattern} -> http://127.0.0.1:{port} (live preview)`,
        );
      }
      if (config.lockToCloud) {
        console.log(`  Backend setup locked to Cloud: ${config.lockToCloud}`);
      }
      console.log("  * (default) -> static files + SPA fallback");
      const agentServerUrl =
        config.routes["/api"] ||
        process.env.GROKBOT_AGENT_SERVER_URL ||
        "";
      const dispatchApiKey =
        process.env.GROKBOT_AGENT_SERVER_API_KEY ||
        process.env.LOCAL_BACKEND_API_KEY ||
        config.sessionApiKey;
      if (agentServerUrl && dispatchApiKey) {
        const stopDispatcher = startJobBoardDispatcher({
          agentServerUrl,
          apiKey: dispatchApiKey,
        });
        server.on("close", stopDispatcher);
        console.log("  Job board dispatcher: armed (auto-run when enabled)");
      }
      console.log("");
      resolveListen(server);
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  try {
    const config = parseArgs();
    await startStaticServer(config);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

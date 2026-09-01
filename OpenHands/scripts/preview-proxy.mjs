/**
 * Live app preview — host-based reverse proxy to dev servers running inside
 * the container.
 *
 * Everything in the GrokBot image (agent bash, the dev servers the agent
 * starts, and this ingress) shares one container and therefore one loopback
 * interface. A dev server the agent starts on :3000 is reachable from the
 * ingress at 127.0.0.1:3000 — but it is not reachable from a browser, because
 * Coolify only publishes the ingress port.
 *
 * This module bridges that gap by mapping hostnames to internal ports:
 *
 *   https://teddybear.beenex.space/anything -> http://127.0.0.1:3000/anything
 *   https://p3000.beenex.space/anything     -> http://127.0.0.1:3000/anything
 *   https://p3000.beenex.org/anything       -> http://127.0.0.1:3000/anything
 *
 * Host-based (rather than path-based, e.g. /preview/3000/…) is deliberate.
 * Because the path is passed through untouched:
 *   - root-absolute asset URLs (`/assets/index-abc.js`, which is what a Vite
 *     production build emits) resolve correctly;
 *   - the previewed app's own `/api/*` routes don't collide with the canvas's;
 *   - history.pushState URLs survive a reload;
 *   - service workers get the `/` scope they ask for.
 * A path-prefix scheme breaks all four, and needs `<base>` rewriting plus
 * Referer sniffing to limp along.
 *
 * It is also the safer option. `static-server.mjs` injects the session API key
 * into the canvas's localStorage, so serving previews from the canvas origin
 * would let any previewed app read that key. A distinct hostname is a distinct
 * origin, so the browser blocks it outright.
 */

import { readFile } from "node:fs/promises";
import { getApp, listApps } from "./app-registry.mjs";

/**
 * Ports belonging to the GrokBot stack itself. Preview hostnames are public —
 * anyone with the link can reach them — so these must never be proxyable, or a
 * shared link would expose the agent-server / automation API surface.
 *
 * Kept in sync with config/defaults.json `ports` by way of the entrypoint,
 * which passes the live values via --preview-block-port.
 */
export const DEFAULT_BLOCKED_PORTS = [8000, 18000, 18001];

/** Below 1024 is privileged/system territory; nothing the agent starts lives there. */
const MIN_PREVIEW_PORT = 1024;
const MAX_PREVIEW_PORT = 65535;

/**
 * Linux's default ephemeral range (net.ipv4.ip_local_port_range). Sockets here
 * were assigned by the kernel, not chosen by a person, so a listener in this
 * range is some library's incidental RPC/debug socket rather than an app worth
 * previewing. Excluded from discovery so the UI doesn't report noise like
 * ":46069" as "your app".
 */
const EPHEMERAL_PORT_MIN = 32768;
const EPHEMERAL_PORT_MAX = 60999;

/** TCP_LISTEN, as reported in the `st` column of /proc/net/tcp{,6}. */
const TCP_LISTEN_STATE = "0A";

export function isPreviewablePort(port, blockedPorts = DEFAULT_BLOCKED_PORTS) {
  if (!Number.isInteger(port)) return false;
  if (port < MIN_PREVIEW_PORT || port > MAX_PREVIEW_PORT) return false;
  return !blockedPorts.includes(port);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Compile host patterns like `{app}.beenex.space`, `p{port}.beenex.space`, `p{port}.beenex.org`
 * into a multi-host matcher supporting both named apps and numeric ports.
 */
export function createPreviewHostMatcher(
  patterns,
  blockedPorts = DEFAULT_BLOCKED_PORTS,
  appLookup = getApp,
) {
  if (!patterns) return null;

  // Split comma-separated patterns
  const patternList = (Array.isArray(patterns) ? patterns : patterns.split(","))
    .map((p) => p.trim())
    .filter(Boolean);

  if (patternList.length === 0) return null;

  const matchers = [];

  for (const pattern of patternList) {
    if (pattern.includes("{port}")) {
      const [before, after] = pattern.split("{port}", 2);
      const regex = new RegExp(
        `^${escapeRegExp(before)}(\\d{1,5})${escapeRegExp(after)}$`,
        "i",
      );
      matchers.push({ type: "port", regex });
    } else if (pattern.includes("{app}")) {
      const [before, after] = pattern.split("{app}", 2);
      const regex = new RegExp(
        `^${escapeRegExp(before)}([a-z0-9][a-z0-9-]{0,62})${escapeRegExp(after)}$`,
        "i",
      );
      matchers.push({ type: "app", regex });
    }
  }

  // Also support default generic pattern matching for beenex.space and beenex.org subdomains
  const defaultPortRegex = /^p(\d{1,5})\.(?:beenex\.(?:space|org))$/i;
  const defaultAppRegex = /^([a-z0-9][a-z0-9-]{0,62})\.(?:beenex\.(?:space|org))$/i;

  async function resolveHost(hostHeader) {
    if (!hostHeader) return null;
    const hostname = hostHeader.split(":")[0].trim().toLowerCase();

    // 1. Check custom port matchers
    for (const matcher of matchers) {
      if (matcher.type === "port") {
        const match = matcher.regex.exec(hostname);
        if (match) {
          const port = Number.parseInt(match[1], 10);
          if (isPreviewablePort(port, blockedPorts)) {
            return { port, appName: null };
          }
        }
      }
    }

    // 2. Check default numeric port regex (e.g. p3000.beenex.space or p3000.beenex.org)
    const portMatch = defaultPortRegex.exec(hostname);
    if (portMatch) {
      const port = Number.parseInt(portMatch[1], 10);
      if (isPreviewablePort(port, blockedPorts)) {
        return { port, appName: null };
      }
    }

    // 3. Check custom app name matchers
    for (const matcher of matchers) {
      if (matcher.type === "app") {
        const match = matcher.regex.exec(hostname);
        if (match) {
          const appName = match[1].toLowerCase();
          // Skip if it looks like grok or grok-api main service
          if (appName === "grok" || appName === "grok-api" || appName === "ship" || appName === "ship-api") return null;

          // If it starts with p + digits, treat as port
          if (/^p\d+$/.test(appName)) {
            const port = Number.parseInt(appName.slice(1), 10);
            if (isPreviewablePort(port, blockedPorts)) {
              return { port, appName: null };
            }
          }

          if (appLookup) {
            const app = await appLookup(appName);
            if (app && isPreviewablePort(app.port, blockedPorts)) {
              return { port: app.port, appName: app.name };
            }
            return { port: null, appName, notFound: true };
          }
        }
      }
    }

    // 4. Check default app regex for beenex.space
    if (hostname.endsWith(".beenex.space") || hostname.endsWith(".beenex.org")) {
      const appMatch = defaultAppRegex.exec(hostname);
      if (appMatch) {
        const appName = appMatch[1].toLowerCase();
        if (appName === "grok" || appName === "grok-api" || appName === "ship" || appName === "ship-api") return null;

        if (/^p\d+$/.test(appName)) {
          const port = Number.parseInt(appName.slice(1), 10);
          if (isPreviewablePort(port, blockedPorts)) {
            return { port, appName: null };
          }
        }

        if (appLookup) {
          const app = await appLookup(appName);
          if (app && isPreviewablePort(app.port, blockedPorts)) {
            return { port: app.port, appName: app.name };
          }
          return { port: null, appName, notFound: true };
        }
      }
    }

    return null;
  }

  // Synchronous port-only helper for legacy callers
  function portForHost(hostHeader) {
    if (!hostHeader) return null;
    const hostname = hostHeader.split(":")[0].trim().toLowerCase();

    for (const matcher of matchers) {
      if (matcher.type === "port") {
        const match = matcher.regex.exec(hostname);
        if (match) {
          const port = Number.parseInt(match[1], 10);
          return isPreviewablePort(port, blockedPorts) ? port : null;
        }
      }
    }

    const portMatch = defaultPortRegex.exec(hostname);
    if (portMatch) {
      const port = Number.parseInt(portMatch[1], 10);
      return isPreviewablePort(port, blockedPorts) ? port : null;
    }

    return null;
  }

  resolveHost.portForHost = portForHost;
  return resolveHost;
}

/**
 * Parse listening TCP ports out of a /proc/net/tcp-style table.
 */
export function parseListeningPorts(procNetTcpContents) {
  const ports = new Set();

  for (const line of procNetTcpContents.split("\n").slice(1)) {
    const columns = line.trim().split(/\s+/);
    if (columns.length < 4) continue;
    if (columns[3] !== TCP_LISTEN_STATE) continue;

    const hexPort = columns[1]?.split(":")[1];
    if (!hexPort) continue;

    const port = Number.parseInt(hexPort, 16);
    if (Number.isInteger(port)) ports.add(port);
  }

  return ports;
}

/**
 * List ports with something listening on them inside this container.
 */
export async function listListeningPorts(
  blockedPorts = DEFAULT_BLOCKED_PORTS,
  procFiles = ["/proc/net/tcp", "/proc/net/tcp6"],
  ignoredPorts = new Set(),
) {
  const ports = new Set();

  await Promise.all(
    procFiles.map(async (file) => {
      try {
        const contents = await readFile(file, "utf8");
        for (const port of parseListeningPorts(contents)) ports.add(port);
      } catch {
        // Not Linux, or /proc not mounted — nothing to contribute.
      }
    }),
  );

  return [...ports]
    .filter((port) => isPreviewablePort(port, blockedPorts))
    .filter((port) => port < EPHEMERAL_PORT_MIN || port > EPHEMERAL_PORT_MAX)
    .filter((port) => !ignoredPorts.has(port))
    .sort((a, b) => a - b);
}

/**
 * Ports already listening before the agent could have started anything.
 */
export async function captureInfrastructurePorts(
  blockedPorts = DEFAULT_BLOCKED_PORTS,
) {
  return new Set(await listListeningPorts(blockedPorts));
}

/**
 * Friendly stand-in for when no dev server answered on the requested port.
 */
export function writePreviewUnavailable(res, port, appName = null) {
  if (res.headersSent || res.destroyed) return;

  const targetDesc = appName
    ? `App <strong>${appName}</strong> (port <code>localhost:${port}</code>)`
    : `Port <code>localhost:${port}</code>`;

  const body = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Nothing running on port ${port}</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center;
    justify-content: center; font: 15px/1.6 ui-sans-serif, system-ui, -apple-system, sans-serif;
    background: #09090b; color: #f4f4f5; text-align: center; padding: 24px;
  }
  .card {
    max-width: 32rem; background: #18181b; border: 1px solid #27272a;
    border-radius: 16px; padding: 32px 28px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
  }
  .icon { font-size: 2.5rem; margin-bottom: 1rem; }
  h1 { font-size: 1.35rem; margin: 0 0 .75rem; font-weight: 600; letter-spacing: -0.02em; }
  p { margin: 0 0 1rem; color: #a1a1aa; font-size: 0.95rem; }
  code { background: #27272a; padding: .2em .45em; border-radius: 6px; color: #38bdf8; font-family: ui-monospace, monospace; font-size: 0.9em; }
</style>
</head>
<body>
  <div class="card">
    <div class="icon">🔌</div>
    <h1>No Server Responded</h1>
    <p>This preview points at ${targetDesc} inside the GrokBot workspace, but no server is currently listening.</p>
    <p>Start your dev server, then reload this page.</p>
  </div>
</body>
</html>`;

  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Preview-Status": `no-listener-on-${port}`,
  });
  res.end(body);
}

/**
 * Friendly landing page when a named app is not found or has been stopped.
 */
export async function writeAppNotFound(res, appName) {
  if (res.headersSent || res.destroyed) return;

  let activeApps = [];
  try {
    activeApps = await listApps();
  } catch {
    // Non-critical fallback
  }

  const appItems =
    activeApps.length > 0
      ? activeApps
          .map(
            (app) => `
        <li style="margin: 8px 0; list-style: none;">
          <a href="https://${app.name}.beenex.space" style="color: #38bdf8; text-decoration: none; font-weight: 500;">
            ✨ ${app.title || app.name} (<code>${app.name}.beenex.space</code>)
          </a>
        </li>`,
          )
          .join("")
      : `<li style="color: #71717a; list-style: none;">No other apps currently registered</li>`;

  const body = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>App "${appName}" Not Found</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center;
    justify-content: center; font: 15px/1.6 ui-sans-serif, system-ui, -apple-system, sans-serif;
    background: #09090b; color: #f4f4f5; text-align: center; padding: 24px;
  }
  .card {
    max-width: 34rem; background: #18181b; border: 1px solid #27272a;
    border-radius: 16px; padding: 36px 28px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
  }
  .icon { font-size: 2.5rem; margin-bottom: 1rem; }
  h1 { font-size: 1.35rem; margin: 0 0 .75rem; font-weight: 600; letter-spacing: -0.02em; }
  p { margin: 0 0 1.25rem; color: #a1a1aa; font-size: 0.95rem; }
  .app-list { background: #121215; border: 1px solid #27272a; border-radius: 12px; padding: 16px; margin: 16px 0; text-align: left; }
  .list-title { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; color: #71717a; margin-bottom: 8px; font-weight: 600; }
  code { background: #27272a; padding: .2em .45em; border-radius: 6px; color: #fbbf24; font-family: ui-monospace, monospace; font-size: 0.9em; }
</style>
</head>
<body>
  <div class="card">
    <div class="icon">🔍</div>
    <h1>App "${appName}" Not Found</h1>
    <p>No active application is registered with the subdomain <code>${appName}.beenex.space</code>.</p>
    <div class="app-list">
      <div class="list-title">Active Applications:</div>
      <ul style="padding: 0; margin: 0;">
        ${appItems}
      </ul>
    </div>
  </div>
</body>
</html>`;

  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Preview-Status": `app-not-found-${appName}`,
  });
  res.end(body);
}

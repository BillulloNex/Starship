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
 * This module bridges that gap by mapping a *hostname* to an internal port:
 *
 *   https://p3000.beenex.org/anything  ->  http://127.0.0.1:3000/anything
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
 * Compile a host pattern like `p{port}.beenex.org` into a matcher.
 *
 * Returns null when no pattern is configured (host-based preview disabled) or
 * the pattern has no `{port}` placeholder — without the placeholder every
 * hostname would map to the same port, which is never what the operator meant.
 */
export function createPreviewHostMatcher(
  pattern,
  blockedPorts = DEFAULT_BLOCKED_PORTS,
) {
  if (!pattern?.includes("{port}")) return null;

  const [before, after] = pattern.split("{port}", 2);
  const regex = new RegExp(
    `^${escapeRegExp(before)}(\\d{1,5})${escapeRegExp(after)}$`,
    "i",
  );

  return function portForHost(hostHeader) {
    if (!hostHeader) return null;
    // Strip any :port suffix — the browser sends `p3000.beenex.org:443` on
    // non-default ports, and Traefik forwards the Host header verbatim.
    const hostname = hostHeader.split(":")[0].trim().toLowerCase();
    const match = regex.exec(hostname);
    if (!match) return null;

    const port = Number.parseInt(match[1], 10);
    return isPreviewablePort(port, blockedPorts) ? port : null;
  };
}

/**
 * Parse listening TCP ports out of a /proc/net/tcp-style table.
 *
 * Format (columns are space-separated, header row first):
 *   sl  local_address rem_address st ...
 *    0: 00000000:1F90 00000000:0000 0A ...
 *
 * `local_address` is HEX_IP:HEX_PORT, and `st` is the connection state.
 * Exported separately from the file read so it can be unit-tested without
 * a Linux /proc.
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
 *
 * Reads /proc directly rather than shelling out to `ss`/`lsof` — neither is
 * guaranteed to be in the agent-server base image, and /proc is free.
 * Returns [] anywhere /proc/net is unavailable (macOS dev machines), which
 * degrades to "no ports detected" rather than failing the request.
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
 *
 * The ingress is the last thing the entrypoint starts, so whatever is bound at
 * that moment belongs to the image itself (the agent-server's own auxiliary
 * services, for instance, which vary by base-image version and can't be
 * hardcoded). Subtracting this baseline is what lets the UI say "no app is
 * running yet" instead of pointing at an internal service and calling it the
 * user's app.
 */
export async function captureInfrastructurePorts(
  blockedPorts = DEFAULT_BLOCKED_PORTS,
) {
  return new Set(await listListeningPorts(blockedPorts));
}

/**
 * Friendly stand-in for the raw "Bad Gateway" a dead upstream would produce.
 *
 * Preview URLs get shared with people who have no idea what a reverse proxy
 * is, and a dev server that has not been started yet (or has crashed) is the
 * single most likely thing they will hit.
 */
export function writePreviewUnavailable(res, port) {
  if (res.headersSent || res.destroyed) return;

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
    justify-content: center; font: 15px/1.6 ui-sans-serif, system-ui, sans-serif;
    background: #0f0f10; color: #e8e8ea; text-align: center; padding: 24px;
  }
  .card { max-width: 32rem; }
  h1 { font-size: 1.25rem; margin: 0 0 .5rem; font-weight: 600; }
  p { margin: 0 0 .75rem; color: #a1a1aa; }
  code { background: #1c1c1f; padding: .15em .4em; border-radius: 4px; color: #e8e8ea; }
</style>
</head>
<body>
  <div class="card">
    <h1>Nothing is listening on port ${port}</h1>
    <p>This preview points at <code>localhost:${port}</code> inside the GrokBot
       workspace, but no server answered.</p>
    <p>Start the app there, then reload this page.</p>
  </div>
</body>
</html>`;

  // Deliberately 200, not 502. A CDN in front of the origin (Cloudflare here)
  // replaces 5xx bodies with its own "error code: 502" page, which would throw
  // away this explanation for exactly the audience it's written for — whoever
  // the user shared the link with. The header carries the real state for
  // anything reading this programmatically.
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Preview-Status": `no-listener-on-${port}`,
  });
  res.end(body);
}

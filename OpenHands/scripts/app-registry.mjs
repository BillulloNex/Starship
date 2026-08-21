/**
 * Grokbot App Registry — Manages multi-app registrations, static edge deployments,
 * port assignments, and background dev servers.
 */

import { existsSync } from "node:fs";
import { readdir, readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { spawn, exec } from "node:child_process";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { DEFAULT_BLOCKED_PORTS, isPreviewablePort, listListeningPorts } from "./preview-proxy.mjs";

export const DEFAULT_REGISTRY_PATH =
  process.env.GROKBOT_APPS_REGISTRY_PATH ||
  (existsSync("/projects")
    ? "/projects/.grokbot/apps.json"
    : "/opt/agent-canvas/apps.json");

export const APP_PORT_RANGE_START = 3000;
export const APP_PORT_RANGE_END = 3999;
export const APPS_LOG_DIR = "/tmp/grokbot-apps";

// Simple in-memory mutex to prevent concurrent write collisions within a Node process
let writeLock = Promise.resolve();

/**
 * Normalizes an app name into a clean subdomain slug:
 * lowercase, alphanumeric and hyphens, 1-63 characters.
 */
export function normalizeAppName(rawName) {
  if (!rawName || typeof rawName !== "string") return null;
  const slug = rawName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (slug.length === 0 || slug.length > 63) return null;
  if (!/^[a-z0-9]/.test(slug)) return null;
  return slug;
}

/**
 * Loads the apps registry from disk.
 * Returns an object mapping appName -> AppRecord.
 */
export async function loadRegistry(registryPath = DEFAULT_REGISTRY_PATH) {
  try {
    const raw = await readFile(registryPath, "utf8");
    const data = JSON.parse(raw);
    if (data && typeof data === "object" && !Array.isArray(data)) {
      return data;
    }
    return {};
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.warn(`[app-registry] Failed to read ${registryPath}:`, err.message);
    }
    return {};
  }
}

/**
 * Saves the apps registry to disk atomically via temporary file and atomic rename.
 */
export async function saveRegistry(registry, registryPath = DEFAULT_REGISTRY_PATH) {
  const op = async () => {
    try {
      const dir = path.dirname(registryPath);
      await mkdir(dir, { recursive: true });
      const tempPath = `${registryPath}.tmp.${process.pid}.${Date.now()}`;
      await writeFile(tempPath, JSON.stringify(registry, null, 2), "utf8");
      await rename(tempPath, registryPath);
    } catch (err) {
      console.error(`[app-registry] Failed to save ${registryPath}:`, err.message);
      throw err;
    }
  };

  writeLock = writeLock.then(op, op);
  return writeLock;
}

/**
 * Probes whether a port is currently accepting TCP connections.
 * Works uniformly across Linux, macOS, WSL, and Docker.
 */
export function checkPortListening(port, host = "127.0.0.1", timeoutMs = 80) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);

    const cleanup = () => {
      socket.removeAllListeners();
      socket.destroy();
    };

    socket.once("connect", () => {
      cleanup();
      resolve(true);
    });

    socket.once("timeout", () => {
      cleanup();
      resolve(false);
    });

    socket.once("error", () => {
      cleanup();
      resolve(false);
    });

    socket.connect(port, host);
  });
}

/**
 * Registers a dynamic application running on a container port.
 * @param {object} options
 * @param {string} options.name
 * @param {number|string} options.port
 * @param {string} [options.title]
 * @param {number|string} [options.pid]
 * @param {string} [options.dir]
 * @param {string} [options.startCmd]
 * @param {string} [options.start_cmd]
 * @param {boolean} [options.auto_restart]
 * @param {string} [registryPath]
 * @param {number[]} [blockedPorts]
 */
export async function registerApp(
  { name, port, title, pid, dir, startCmd, start_cmd, auto_restart = true },
  registryPath = DEFAULT_REGISTRY_PATH,
  blockedPorts = DEFAULT_BLOCKED_PORTS,
) {
  const slug = normalizeAppName(name);
  if (!slug) {
    throw new Error(
      `Invalid app name "${name}". App names must contain only lowercase letters, numbers, and hyphens (1-63 chars).`,
    );
  }

  const numericPort = Number.parseInt(port, 10);
  if (!isPreviewablePort(numericPort, blockedPorts)) {
    throw new Error(
      `Invalid or reserved port ${port}. Must be between 1024 and 65535 and not in reserved list (${blockedPorts.join(", ")}).`,
    );
  }

  const registry = await loadRegistry(registryPath);
  const now = new Date().toISOString();

  const record = {
    type: "dynamic",
    name: slug,
    port: numericPort,
    title: title || slug,
    pid: pid ? Number.parseInt(pid, 10) : registry[slug]?.pid || undefined,
    dir: dir || registry[slug]?.dir || undefined,
    start_cmd: startCmd || start_cmd || registry[slug]?.start_cmd || undefined,
    auto_restart: auto_restart ?? registry[slug]?.auto_restart ?? true,
    created_at: registry[slug]?.created_at || now,
    updated_at: now,
    ignored: false,
  };

  registry[slug] = record;
  await saveRegistry(registry, registryPath);
  return record;
}

/**
 * Registers a static web app or game deployed to Cloudflare Pages.
 * @param {object} options
 * @param {string} options.name
 * @param {string} [options.title]
 * @param {string} [options.url]
 * @param {string} [options.dir]
 * @param {string} [options.branch]
 * @param {string} [options.provider]
 * @param {string} [registryPath]
 */
export async function registerStaticApp(
  { name, title, url, dir, branch = "main", provider = "cloudflare_pages" },
  registryPath = DEFAULT_REGISTRY_PATH,
) {
  const slug = normalizeAppName(name);
  if (!slug) {
    throw new Error(
      `Invalid app name "${name}". App names must contain only lowercase letters, numbers, and hyphens (1-63 chars).`,
    );
  }

  const registry = await loadRegistry(registryPath);
  const now = new Date().toISOString();

  const record = {
    type: "static",
    provider,
    name: slug,
    title: title || slug,
    url: url || `https://${slug}.pages.dev`,
    dir: dir || registry[slug]?.dir || undefined,
    branch,
    created_at: registry[slug]?.created_at || now,
    updated_at: now,
    deployed_at: now,
    ignored: false,
  };

  registry[slug] = record;
  await saveRegistry(registry, registryPath);
  return record;
}

/**
 * Unregisters an application by name and optionally stops any running process on its port.
 */
export async function unregisterApp(
  name,
  registryPath = DEFAULT_REGISTRY_PATH,
  stopProcess = true,
) {
  const slug = normalizeAppName(name);
  if (!slug) return false;

  const registry = await loadRegistry(registryPath);
  const existing = registry[slug];
  if (!existing) return false;

  if (stopProcess && existing.type !== "static" && existing.port) {
    try {
      await stopApp(slug, registryPath);
    } catch {}
  }

  delete registry[slug];
  await saveRegistry(registry, registryPath);
  return true;
}

/**
 * Look up an app by name.
 */
export async function getApp(name, registryPath = DEFAULT_REGISTRY_PATH) {
  const slug = normalizeAppName(name);
  if (!slug) return null;
  const registry = await loadRegistry(registryPath);
  return registry[slug] || null;
}

/**
 * Look up an app by port.
 */
export async function getAppByPort(port, registryPath = DEFAULT_REGISTRY_PATH) {
  const numericPort = Number.parseInt(port, 10);
  if (!Number.isInteger(numericPort)) return null;
  const registry = await loadRegistry(registryPath);
  for (const app of Object.values(registry)) {
    if (app.port === numericPort) return app;
  }
  return null;
}

/**
 * Builds the appropriate start command ensuring the allocated port is passed.
 */
export function buildStartCommand(appDir, port, customCmd) {
  if (customCmd) {
    if (customCmd.includes("$PORT") || customCmd.includes("${PORT}")) {
      return customCmd;
    }
    if (customCmd.trim() === "npm run dev") {
      return `npm run dev -- --port ${port} --host 0.0.0.0`;
    }
    return customCmd;
  }

  if (existsSync(path.join(appDir, "package.json"))) {
    return `npm run dev -- --port ${port} --host 0.0.0.0`;
  }
  if (existsSync(path.join(appDir, "server.js"))) {
    return `node server.js`;
  }
  if (existsSync(path.join(appDir, "index.html"))) {
    return `npx -y serve -l ${port} .`;
  }
  if (
    existsSync(path.join(appDir, "app.py")) ||
    existsSync(path.join(appDir, "main.py"))
  ) {
    return `python3 -m http.server ${port} --bind 0.0.0.0`;
  }

  return null;
}

/**
 * Scans directories (e.g. /projects, /workspace) for web applications,
 * registering any discovered projects that are not yet in the registry.
 */
export async function discoverProjects(
  baseDir = "/projects",
  registryPath = DEFAULT_REGISTRY_PATH,
) {
  if (!existsSync(baseDir)) return [];
  const registry = await loadRegistry(registryPath);
  const registeredDirs = new Set(
    Object.values(registry)
      .map((a) => a.dir)
      .filter(Boolean),
  );

  let entries = [];
  try {
    entries = await readdir(baseDir, { withFileTypes: true });
  } catch (err) {
    return [];
  }

  const discovered = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const projectDir = path.join(baseDir, entry.name);
    const slug = normalizeAppName(entry.name);
    if (!slug) continue;

    if (registry[slug] || registeredDirs.has(projectDir)) continue;

    const hasPkg = existsSync(path.join(projectDir, "package.json"));
    const hasHtml = existsSync(path.join(projectDir, "index.html"));
    const hasServer = existsSync(path.join(projectDir, "server.js"));
    const hasAppPy =
      existsSync(path.join(projectDir, "app.py")) ||
      existsSync(path.join(projectDir, "main.py"));

    if (hasPkg || hasHtml || hasServer || hasAppPy) {
      try {
        const port = await allocateNextPort({}, registryPath);
        const start_cmd = buildStartCommand(projectDir, port);

        const record = await registerApp(
          {
            name: slug,
            port,
            title: entry.name
              .replace(/[-_]+/g, " ")
              .replace(/\b\w/g, (c) => c.toUpperCase()),
            dir: projectDir,
            start_cmd,
          },
          registryPath,
        );
        discovered.push(record);
      } catch (err) {
        console.warn(
          `[app-registry] Failed to auto-register project "${entry.name}":`,
          err.message,
        );
      }
    }
  }

  return discovered;
}

/**
 * Returns a list of all registered applications.
 * (Pure read function; does not mutate disk or auto-discover on GET).
 */
export async function listApps(registryPath = DEFAULT_REGISTRY_PATH) {
  const registry = await loadRegistry(registryPath);
  return Object.values(registry).sort((a, b) =>
    (b.updated_at || "").localeCompare(a.updated_at || ""),
  );
}

/**
 * Explicitly scans workspace directories and synchronizes discoveries.
 */
export async function scanAndDiscoverApps(
  registryPath = DEFAULT_REGISTRY_PATH,
  scanDirs = ["/projects", "/workspace"],
) {
  const results = [];
  for (const scanDir of scanDirs) {
    if (existsSync(scanDir)) {
      try {
        const discovered = await discoverProjects(scanDir, registryPath);
        results.push(...discovered);
      } catch {}
    }
  }
  return results;
}

/**
 * Finds the next available port that is not in the registry and not in blocked ports.
 */
export async function allocateNextPort(
  options = {},
  registryPath = DEFAULT_REGISTRY_PATH,
) {
  const {
    preferredPort,
    blockedPorts = DEFAULT_BLOCKED_PORTS,
    activePorts = new Set(),
  } = options;

  const registry = await loadRegistry(registryPath);
  const usedPorts = new Set(activePorts);
  for (const app of Object.values(registry)) {
    if (app.port) usedPorts.add(app.port);
  }

  if (
    preferredPort &&
    isPreviewablePort(preferredPort, blockedPorts) &&
    !usedPorts.has(preferredPort)
  ) {
    return preferredPort;
  }

  for (let port = APP_PORT_RANGE_START; port <= APP_PORT_RANGE_END; port++) {
    if (isPreviewablePort(port, blockedPorts) && !usedPorts.has(port)) {
      return port;
    }
  }

  throw new Error("No free preview ports available in the 3000-3999 range.");
}

/**
 * Retrieves the recent log contents for a registered app.
 */
export async function getAppLogs(name, tailLines = 100, registryPath = DEFAULT_REGISTRY_PATH) {
  const app = await getApp(name, registryPath);
  if (!app) {
    throw new Error(`App "${name}" not found in registry.`);
  }

  const logFile = app.log_file || path.join(APPS_LOG_DIR, `${app.name}.log`);
  if (!existsSync(logFile)) {
    return { name, log: "(No logs available yet. Start the app to capture output.)" };
  }

  try {
    const raw = await readFile(logFile, "utf8");
    const lines = raw.split("\n");
    const tail = lines.slice(-tailLines).join("\n");
    return { name, log: tail };
  } catch (err) {
    return { name, log: `Error reading log file: ${err.message}` };
  }
}

/**
 * Starts a single registered application.
 */
export async function startApp(name, registryPath = DEFAULT_REGISTRY_PATH) {
  const app = await getApp(name, registryPath);
  if (!app) {
    throw new Error(`App "${name}" not found in registry.`);
  }

  if (app.type === "static") {
    return { success: true, name, status: "static_edge", url: app.url };
  }

  const isListening = await checkPortListening(app.port);
  if (isListening) {
    return { success: true, name, status: "already_running", port: app.port };
  }

  if (!app.dir || !existsSync(app.dir)) {
    throw new Error(`App directory "${app.dir}" does not exist.`);
  }

  const cmd = buildStartCommand(app.dir, app.port, app.start_cmd);
  if (!cmd) {
    throw new Error(`No start command found or specified for app "${name}".`);
  }

  // Ensure log directory exists
  await mkdir(APPS_LOG_DIR, { recursive: true });
  const logFilePath = path.join(APPS_LOG_DIR, `${app.name}.log`);

  // Write start notice to log
  await writeFile(
    logFilePath,
    `[grokbot] Starting app "${app.name}" on port ${app.port} (${cmd}) at ${new Date().toISOString()}\n`,
    { flag: "a" },
  );

  const outStream = (await import("node:fs")).createWriteStream(logFilePath, { flags: "a" });

  const child = spawn(cmd, {
    cwd: app.dir,
    shell: true,
    detached: true,
    stdio: ["ignore", outStream, outStream],
    env: {
      ...process.env,
      PORT: String(app.port),
      HOST: "0.0.0.0",
    },
  });
  child.unref();

  // Save PID and log path
  await registerApp(
    {
      ...app,
      pid: child.pid,
    },
    registryPath,
  );

  return {
    success: true,
    name,
    status: "started",
    port: app.port,
    pid: child.pid,
    log_file: logFilePath,
  };
}

/**
 * Stops an application by killing its PID or port listener.
 */
export async function stopApp(name, registryPath = DEFAULT_REGISTRY_PATH) {
  const app = await getApp(name, registryPath);
  if (!app) {
    throw new Error(`App "${name}" not found in registry.`);
  }

  if (app.type === "static") {
    return { success: true, name, status: "static_edge" };
  }

  const { port, pid } = app;

  // 1. If we have a PID, try SIGTERM
  if (pid) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {}
  }

  // 2. Kill processes on port
  return new Promise((resolve) => {
    const killCmd = `fuser -k ${port}/tcp 2>/dev/null || (lsof -t -i :${port} | xargs kill -9 2>/dev/null) || (ss -lptn 'sport = :${port}' | grep -o 'pid=[0-9]*' | cut -d= -f2 | xargs kill -9 2>/dev/null) || true`;
    exec(killCmd, () => {
      resolve({ success: true, name, port });
    });
  });
}

/**
 * Auto-starts registered applications on startup or after container restarts.
 */
export async function autoStartApps(options = {}) {
  const { registryPath = DEFAULT_REGISTRY_PATH, logger = console.log } = options;
  const registry = await loadRegistry(registryPath);
  const apps = Object.values(registry).filter((a) => a.type !== "static" && a.auto_restart !== false);
  if (apps.length === 0) {
    logger("[app-registry] No dynamic registered apps to auto-start.");
    return [];
  }

  let listening = [];
  try {
    listening = await listListeningPorts();
  } catch (err) {
    logger(`[app-registry] Warning: Could not list listening ports: ${err.message}`);
  }
  const listeningSet = new Set(listening);

  const results = [];
  for (const app of apps) {
    if (listeningSet.has(app.port)) {
      logger(`[app-registry] App "${app.name}" is already running on port ${app.port}.`);
      results.push({ app: app.name, status: "already_running", port: app.port });
      continue;
    }

    if (!app.dir || !existsSync(app.dir)) {
      logger(`[app-registry] App "${app.name}" directory "${app.dir}" not found; skipping.`);
      results.push({ app: app.name, status: "dir_missing", port: app.port });
      continue;
    }

    try {
      const res = await startApp(app.name, registryPath);
      logger(`[app-registry] Auto-started app "${app.name}" on port ${app.port} (PID ${res.pid}).`);
      results.push(res);
    } catch (err) {
      logger(`[app-registry] Failed to start "${app.name}": ${err.message}`);
      results.push({ app: app.name, status: "error", error: err.message });
    }
  }

  return results;
}

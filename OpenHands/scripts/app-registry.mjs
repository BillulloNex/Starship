/**
 * Grokbot App Registry — Manages multi-app registrations and port assignments.
 *
 * Persists registered applications so that named subdomains (e.g.
 * `https://teddybear.beenex.space`) can map directly to internal ports,
 * preventing separate projects from colliding on the same port.
 */

import { existsSync } from "node:fs";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { spawn, exec } from "node:child_process";
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
 * Saves the apps registry to disk atomically.
 */
export async function saveRegistry(registry, registryPath = DEFAULT_REGISTRY_PATH) {
  try {
    const dir = path.dirname(registryPath);
    await mkdir(dir, { recursive: true });
    await writeFile(registryPath, JSON.stringify(registry, null, 2), "utf8");
  } catch (err) {
    console.error(`[app-registry] Failed to save ${registryPath}:`, err.message);
    throw err;
  }
}

/**
 * Registers an application with a name and port.
 * @param {object} options
 * @param {string} options.name
 * @param {number|string} options.port
 * @param {string} [options.title]
 * @param {number|string} [options.pid]
 * @param {string} [options.dir]
 * @param {string} [options.startCmd]
 * @param {string} [options.start_cmd]
 * @param {string} [registryPath]
 * @param {number[]} [blockedPorts]
 */
export async function registerApp(
  { name, port, title, pid, dir, startCmd, start_cmd },
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
    name: slug,
    port: numericPort,
    title: title || slug,
    pid: pid ? Number.parseInt(pid, 10) : undefined,
    dir: dir || undefined,
    start_cmd: startCmd || start_cmd || registry[slug]?.start_cmd || undefined,
    created_at: registry[slug]?.created_at || now,
    updated_at: now,
  };

  registry[slug] = record;
  await saveRegistry(registry, registryPath);
  return record;
}

/**
 * Unregisters an application by name.
 */
export async function unregisterApp(name, registryPath = DEFAULT_REGISTRY_PATH) {
  const slug = normalizeAppName(name);
  if (!slug) return false;

  const registry = await loadRegistry(registryPath);
  if (!registry[slug]) return false;

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
 * Automatically scans directories (e.g. /projects, /workspace) for web applications,
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
      let start_cmd = undefined;
      if (hasPkg) {
        start_cmd = "npm run dev";
      } else if (hasServer) {
        start_cmd = "node server.js";
      } else if (hasHtml) {
        start_cmd = "npx serve -l $PORT .";
      } else if (hasAppPy) {
        start_cmd = "python3 -m http.server $PORT";
      }

      try {
        const port = await allocateNextPort({}, registryPath);
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
 * Returns a list of all registered applications, auto-discovering any new projects in /projects.
 */
export async function listApps(
  registryPath = DEFAULT_REGISTRY_PATH,
  scanDirs = ["/projects", "/workspace"],
) {
  for (const scanDir of scanDirs) {
    if (existsSync(scanDir)) {
      try {
        await discoverProjects(scanDir, registryPath);
      } catch {}
    }
  }
  const registry = await loadRegistry(registryPath);
  return Object.values(registry).sort((a, b) =>
    (b.updated_at || "").localeCompare(a.updated_at || ""),
  );
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
    usedPorts.add(app.port);
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
 * Auto-starts registered applications on startup or after container restarts.
 */
export async function autoStartApps(options = {}) {
  const { registryPath = DEFAULT_REGISTRY_PATH, logger = console.log } = options;
  const registry = await loadRegistry(registryPath);
  const apps = Object.values(registry);
  if (apps.length === 0) {
    logger("[app-registry] No registered apps to auto-start.");
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

    let cmd = app.start_cmd;
    if (!cmd) {
      if (existsSync(path.join(app.dir, "package.json"))) {
        cmd = `npm run dev -- --port ${app.port} --host 0.0.0.0`;
      } else if (existsSync(path.join(app.dir, "server.js"))) {
        cmd = `node server.js`;
      } else if (existsSync(path.join(app.dir, "index.html"))) {
        cmd = `npx serve -l ${app.port} .`;
      }
    }

    if (!cmd) {
      logger(`[app-registry] App "${app.name}" has no start command; skipping.`);
      results.push({ app: app.name, status: "no_command", port: app.port });
      continue;
    }

    logger(`[app-registry] Auto-starting app "${app.name}" on port ${app.port} in "${app.dir}" (${cmd})...`);
    try {
      const child = spawn(cmd, {
        cwd: app.dir,
        shell: true,
        detached: true,
        stdio: "ignore",
        env: {
          ...process.env,
          PORT: String(app.port),
          HOST: "0.0.0.0",
        },
      });
      child.unref();
      results.push({ app: app.name, status: "started", port: app.port, pid: child.pid });
    } catch (err) {
      logger(`[app-registry] Failed to start "${app.name}": ${err.message}`);
      results.push({ app: app.name, status: "error", error: err.message });
    }
  }

  return results;
}

/**
 * Stops an application by killing processes listening on its port.
 */
export async function stopApp(name, registryPath = DEFAULT_REGISTRY_PATH) {
  const app = await getApp(name, registryPath);
  if (!app) {
    throw new Error(`App "${name}" not found in registry.`);
  }

  const { port } = app;
  return new Promise((resolve) => {
    exec(`fuser -k ${port}/tcp 2>/dev/null || (lsof -t -i :${port} | xargs kill -9 2>/dev/null) || true`, (err) => {
      resolve({ success: true, name, port });
    });
  });
}

/**
 * Starts a single registered application.
 */
export async function startApp(name, registryPath = DEFAULT_REGISTRY_PATH) {
  const app = await getApp(name, registryPath);
  if (!app) {
    throw new Error(`App "${name}" not found in registry.`);
  }

  let listening = [];
  try {
    listening = await listListeningPorts();
  } catch {}
  if (listening.includes(app.port)) {
    return { success: true, name, status: "already_running", port: app.port };
  }

  if (!app.dir || !existsSync(app.dir)) {
    throw new Error(`App directory "${app.dir}" does not exist.`);
  }

  let cmd = app.start_cmd;
  if (!cmd) {
    if (existsSync(path.join(app.dir, "package.json"))) {
      cmd = `npm run dev -- --port ${app.port} --host 0.0.0.0`;
    } else if (existsSync(path.join(app.dir, "server.js"))) {
      cmd = `node server.js`;
    } else if (existsSync(path.join(app.dir, "index.html"))) {
      cmd = `npx serve -l ${app.port} .`;
    }
  }

  if (!cmd) {
    throw new Error(`No start command found or specified for app "${name}".`);
  }

  const child = spawn(cmd, {
    cwd: app.dir,
    shell: true,
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      PORT: String(app.port),
      HOST: "0.0.0.0",
    },
  });
  child.unref();

  return { success: true, name, status: "started", port: app.port, pid: child.pid };
}


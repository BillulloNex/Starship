/**
 * Grokbot App Registry — Manages multi-app registrations and port assignments.
 *
 * Persists registered applications so that named subdomains (e.g.
 * `https://teddybear.beenex.space`) can map directly to internal ports,
 * preventing separate projects from colliding on the same port.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { DEFAULT_BLOCKED_PORTS, isPreviewablePort } from "./preview-proxy.mjs";

export const DEFAULT_REGISTRY_PATH =
  process.env.GROKBOT_APPS_REGISTRY_PATH ||
  "/opt/agent-canvas/apps.json";

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
 */
export async function registerApp(
  { name, port, title, pid, dir },
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
 * Returns a list of all registered applications.
 */
export async function listApps(registryPath = DEFAULT_REGISTRY_PATH) {
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

/**
 * Shared PostHog Logs shipper for agent-canvas Node.js processes.
 *
 * Stdlib only (global fetch + timers) so it works in every runtime we ship:
 * the Docker image, dev launchers, and the packaged desktop app whose
 * `afterPack` hook strips `Resources/app/node_modules/`.
 *
 * Ships batched OTLP/HTTP+JSON to `<POSTHOG_HOST>/i/v1/logs` with
 * `service.name` / `deployment.environment` / `service.version` resource
 * attributes. Never throws and never blocks: without an API key it is a
 * no-op, transport errors are swallowed, and the flush timer is unref'd.
 *
 * Env (Coolify is the source of truth, never commit values):
 *   POSTHOG_PROJECT_API_KEY (or VITE_POSTHOG_API_KEY / POSTHOG_API_KEY)
 *   POSTHOG_API_HOST (default https://us.i.posthog.com)
 *   POSTHOG_LOGS_ENABLED=0 to disable
 *   POSTHOG_LOG_ENV / NODE_ENV (deployment.environment)
 *
 * Volume note: PostHog includes 10 GB of logs/month free, then usage-based
 * billing. This ships everything the caller emits — pair with level filtering
 * at the call site if ingest gets hot.
 */

const SEVERITY_NUMBER = {
  trace: 1,
  debug: 5,
  info: 9,
  warn: 13,
  error: 17,
  fatal: 21,
};

const FLUSH_INTERVAL_MS = 3000;
const MAX_QUEUE = 2000;
const MAX_BODY_CHARS = 8000;

let state = null;

function readKey() {
  for (const name of [
    "POSTHOG_PROJECT_API_KEY",
    "VITE_POSTHOG_API_KEY",
    "POSTHOG_API_KEY",
  ]) {
    const value = (process.env[name] || "").trim();
    if (value) return value;
  }
  return "";
}

function readHost() {
  const host = (
    process.env.POSTHOG_API_HOST ||
    process.env.VITE_POSTHOG_HOST ||
    "https://us.i.posthog.com"
  ).trim();
  return host.replace(/\/+$/, "");
}

/**
 * Initialize the shipper for this process. Idempotent — safe to call from
 * every entrypoint that wants its logs in PostHog.
 *
 * @param {{ serviceName?: string, serviceVersion?: string }} options
 * @returns {boolean} true when shipping is active
 */
export function initPostHogLogs(options = {}) {
  if (state) return state.active;
  const enabled = (process.env.POSTHOG_LOGS_ENABLED || "1").trim() !== "0";
  const apiKey = readKey();
  const active = enabled && apiKey.length > 0;
  state = {
    active,
    endpoint: `${readHost()}/i/v1/logs`,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "grokbot-posthog-logs/1.0",
    },
    resourceAttributes: {
      "service.name": options.serviceName || "canvas-node",
      "deployment.environment":
        (process.env.POSTHOG_LOG_ENV || process.env.NODE_ENV || "").trim() ||
        "production",
      ...(options.serviceVersion
        ? { "service.version": options.serviceVersion }
        : {}),
    },
    queue: [],
    flushing: false,
    timer: null,
  };
  if (active && typeof setInterval === "function") {
    state.timer = setInterval(() => {
      flushPostHogLogs().catch(() => {});
    }, FLUSH_INTERVAL_MS);
    if (state.timer && typeof state.timer.unref === "function") {
      state.timer.unref();
    }
  }
  return active;
}

function toOtlpValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value)
      ? { intValue: String(value) }
      : { doubleValue: value };
  }
  if (typeof value === "boolean") {
    return { boolValue: value };
  }
  return { stringValue: String(value ?? "") };
}

function toOtlpAttributes(attrs) {
  return Object.entries(attrs || {})
    .filter(([, v]) => v !== undefined && v !== null)
    .slice(0, 32)
    .map(([key, value]) => ({ key: String(key), value: toOtlpValue(value) }));
}

/**
 * Queue one structured log record. Safe to call before init (no-op).
 *
 * @param {'trace'|'debug'|'info'|'warn'|'error'|'fatal'} level
 * @param {string} body
 * @param {Record<string, unknown>} [attrs]
 */
export function phLog(level, body, attrs) {
  if (!state || !state.active) return;
  const severity = SEVERITY_NUMBER[level] || SEVERITY_NUMBER.info;
  const text = String(body ?? "").slice(0, MAX_BODY_CHARS);
  if (!text) return;
  if (state.queue.length >= MAX_QUEUE) {
    state.queue.splice(0, state.queue.length - MAX_QUEUE + 1);
  }
  state.queue.push({
    timeUnixNano: String(Date.now() * 1e6),
    severityText: String(level).toUpperCase(),
    severityNumber: severity,
    body: { stringValue: text },
    attributes: toOtlpAttributes(attrs),
  });
  if (state.queue.length >= 100) {
    flushPostHogLogs().catch(() => {});
  }
}

/** Flush the queued records. Resolves even when disabled or on error. */
export async function flushPostHogLogs() {
  if (!state || !state.active || state.flushing) return;
  if (state.queue.length === 0) return;
  state.flushing = true;
  const batch = state.queue.splice(0, state.queue.length);
  try {
    const resourceAttributes = toOtlpAttributes(state.resourceAttributes);
    await fetch(state.endpoint, {
      method: "POST",
      headers: state.headers,
      body: JSON.stringify({
        resourceLogs: [
          {
            resource: { attributes: resourceAttributes },
            scopeLogs: [{ logRecords: batch }],
          },
        ],
      }),
    });
  } catch {
    // Logging must never break the host process. Drop the batch.
  } finally {
    state.flushing = false;
  }
}

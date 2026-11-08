/**
 * GlitchTip server-side error tracking — shared Node.js initialization.
 *
 * Import this module at the top of every Node.js server script to enable
 * automatic error reporting to GlitchTip. Captures:
 *   - Uncaught exceptions (with automatic flush before exit)
 *   - Unhandled promise rejections
 *   - All console.error() calls as Issues (via captureConsoleIntegration)
 *   - All console.log/info/warn/error calls as Logs (via
 *     consoleLoggingIntegration)
 *   - Duplicate deduplication
 *
 * Also exports pingHeartbeat(job) for scheduled jobs: after each successful
 * run, the job pings its GlitchTip Heartbeat monitor. The job → endpoint id
 * map comes from GLITCHTIP_HEARTBEATS (JSON, set in Coolify).
 *
 * DSN is opt-in: only initializes when GLITCHTIP_NODE_DSN or GLITCHTIP_DSN
 * is set. No hardcoded fallback for server — explicit config only.
 */

import * as Sentry from "@sentry/node";
import { makeMultiplexedTransport } from "@sentry/core";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import process from "node:process";
import { scrubEvent, scrubStr } from "./glitchtip-scrub.mjs";
import { getSentryDsn } from "./sentry-fanout.mjs";

// ---------------------------------------------------------------------------
// Version detection
// ---------------------------------------------------------------------------

let version = "unknown";
try {
  version = readFileSync("/opt/agent-canvas/VERSION", "utf-8").trim();
} catch {
  try {
    // Local dev fallback
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const __filename = fileURLToPath(import.meta.url);
    const versionPath = join(dirname(__filename), "..", "..", "VERSION");
    version = readFileSync(versionPath, "utf-8").trim();
  } catch {
    // Ignore — use "unknown"
  }
}

// ---------------------------------------------------------------------------
// Process name detection
// ---------------------------------------------------------------------------

const SERVER_NAME = basename(process.argv[1] || "node")
  .replace(/\.mjs$/, "")
  .replace(/\.js$/, "");

// Map script names to service tags for GlitchTip project separation
const SERVICE_MAP = {
  "static-server": "node-proxy",
  ingress: "node-proxy",
  "ship-jira-orchestrator": "orchestrators",
  "ship-log-monitor-orchestrator": "orchestrators",
  "ralph-runner": "orchestrators",
  "cursor-acp-bridge": "orchestrators",
  "grokbot-app": "orchestrators",
  "telegram-bridge": "orchestrators",
  "job-board": "orchestrators",
  "computer-broker": "orchestrators",
};

const service = SERVICE_MAP[SERVER_NAME] || "node-server";

// Release = git commit SHA injected at build time (Dockerfile SOURCE_COMMIT →
// GLITCHTIP_RELEASE). Falls back to the Grokbot version when absent.
const RELEASE =
  process.env.GLITCHTIP_RELEASE ||
  process.env.SOURCE_COMMIT ||
  `grokbot-server@${version}`;

// ---------------------------------------------------------------------------
// Sentry initialization
// ---------------------------------------------------------------------------

const DSN =
  process.env.GLITCHTIP_NODE_DSN ||
  process.env.GLITCHTIP_ORCH_DSN ||
  process.env.GLITCHTIP_DSN ||
  // Fallback to frontend DSN — same project, differentiated by service tag.
  // Server events are distinguished by tags.process and tags.service.
  process.env.VITE_GLITCHTIP_DSN ||
  "";

// Optional mirror to Sentry SaaS. With both set, every envelope goes to both;
// with only SENTRY_DSN set, Sentry becomes the sole sink.
const SENTRY_DSN = getSentryDsn();
const PRIMARY_DSN = DSN || SENTRY_DSN;

let initialized = false;

if (PRIMARY_DSN) {
  try {
    Sentry.init({
      dsn: PRIMARY_DSN,
      transport:
        DSN && SENTRY_DSN
          ? makeMultiplexedTransport(Sentry.makeNodeTransport, () => [
              DSN,
              SENTRY_DSN,
            ])
          : undefined,
      release: RELEASE,
      // Sentry JS SDK v11 always sends logs (no `enableLogs` flag any more);
      // consoleLoggingIntegration below feeds console output into them.
      environment:
        process.env.GLITCHTIP_ENVIRONMENT ||
        process.env.NODE_ENV ||
        "production",
      serverName: SERVER_NAME,
      sampleRate: 1.0,
      tracesSampleRate: 0,
      sendDefaultPii: false,

      // Noise filters — same as frontend
      ignoreErrors: [
        "ResizeObserver loop",
        "AbortError",
        /Loading chunk \d+ failed/,
        "ECONNRESET",
        "EPIPE",
        "ECONNREFUSED",
        "socket hang up",
      ],

      // Built-in integrations handle uncaught exceptions and rejections
      // with proper flush — do NOT use hand-rolled process.on handlers.
      // captureConsoleIntegration captures all console.error calls.
      integrations: [
        Sentry.captureConsoleIntegration({ levels: ["error"] }),
        Sentry.consoleLoggingIntegration({
          levels: ["log", "info", "warn", "error"],
        }),
        Sentry.dedupeIntegration(),
      ],

      beforeSend(event) {
        const scrubbed = scrubEvent(event);
        if (!scrubbed) return null;

        // Normalize dynamic IDs for better grouping
        if (scrubbed.message) {
          scrubbed.fingerprint = [
            scrubbed.message
              .replace(/[0-9a-f]{8,}/gi, "{ID}")
              .replace(/\/[0-9]+/g, "/{N}")
              .replace(/port \d+/g, "port {PORT}"),
          ];
        }

        return scrubbed;
      },

      beforeSendLog(log) {
        // Same secret scrubbing as events, applied to log bodies.
        if (typeof log.message === "string") log.message = scrubStr(log.message);
        return log;
      },

      initialScope: {
        tags: {
          process: SERVER_NAME,
          service,
        },
      },
    });

    // Flush on SIGTERM (graceful shutdown)
    process.on("SIGTERM", () => {
      Sentry.close(2000).finally(() => process.exit(0));
    });

    initialized = true;

    // Add process health context periodically
    const updateProcessHealth = () => {
      try {
        const mem = process.memoryUsage();
        Sentry.setContext("process_health", {
          rss_mb: Math.round(mem.rss / 1024 / 1024),
          heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
          heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024),
          uptime_s: Math.round(process.uptime()),
        });
      } catch {
        // Non-critical
      }
    };
    updateProcessHealth();
    setInterval(updateProcessHealth, 60_000).unref();

    Sentry.logger.info("deploy", {
      release: RELEASE,
      version,
      process: SERVER_NAME,
      service,
    });

    console.log(
      `[glitchtip-server] Initialized — release=${RELEASE}, ` +
        `process=${SERVER_NAME}, service=${service}` +
        (SENTRY_DSN ? (DSN ? ", mirroring to Sentry" : ", Sentry only") : ""),
    );
  } catch (err) {
    console.error(`[glitchtip-server] Init FAILED: ${err.message}`);
  }
} else {
  // Silent when no DSN — expected in local dev
}

// ---------------------------------------------------------------------------
// Heartbeats for scheduled jobs
// ---------------------------------------------------------------------------

const HEARTBEAT_BASE =
  "https://glitchtip.beenex.cloud/api/0/organizations/beenex/heartbeat_check";

/**
 * Parse GLITCHTIP_HEARTBEATS: `job-key=endpoint-uuid,job-key=endpoint-uuid`
 * (no quotes, so it survives Coolify's .env handling). Python twin:
 * tools/automation_glitchtip.py heartbeat_map().
 */
export function heartbeatMap(raw = process.env.GLITCHTIP_HEARTBEATS) {
  const map = {};
  for (const pair of String(raw ?? "").split(",")) {
    const i = pair.indexOf("=");
    if (i > 0) map[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  }
  return map;
}

/**
 * Ping the GlitchTip Heartbeat monitor for `job` after a successful run.
 * Never throws: a failed ping must not fail the job. Returns true on 2xx.
 */
export async function pingHeartbeat(job) {
  const endpointId = heartbeatMap()[job];
  if (!endpointId) return false;
  try {
    const response = await fetch(`${HEARTBEAT_BASE}/${endpointId}/`, {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.warn(`[glitchtip-server] heartbeat ${job} → HTTP ${response.status}`);
    }
    return response.ok;
  } catch (error) {
    console.warn(`[glitchtip-server] heartbeat ${job} failed: ${error.message}`);
    return false;
  }
}

/**
 * Record one scheduled-job outcome: a structured log line, and for failures
 * an Issue. Safe to call when Sentry is not initialized.
 */
export function reportJobOutcome(job, outcome, attributes = {}, error = null) {
  if (!initialized) return;
  try {
    const attrs = { job, outcome, ...attributes };
    if (outcome === "success") {
      Sentry.logger.info(`job ${job} succeeded`, attrs);
    } else {
      Sentry.logger.error(`job ${job} ${outcome}`, attrs);
      Sentry.withScope((scope) => {
        scope.setTag("job", job);
        scope.setTag("job_outcome", outcome);
        scope.setContext("job", attrs);
        if (error) Sentry.captureException(error);
        else Sentry.captureMessage(`Scheduled job ${job} ${outcome}`, "error");
      });
    }
  } catch {
    // Reporting must never break the job.
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { Sentry, initialized as glitchtipInitialized, RELEASE as glitchtipRelease };

/**
 * GlitchTip server-side error tracking — shared Node.js initialization.
 *
 * Import this module at the top of every Node.js server script to enable
 * automatic error reporting to GlitchTip. Captures:
 *   - Uncaught exceptions (with automatic flush before exit)
 *   - Unhandled promise rejections
 *   - All console.error() calls (via captureConsoleIntegration)
 *   - Duplicate deduplication
 *
 * DSN is opt-in: only initializes when GLITCHTIP_NODE_DSN or GLITCHTIP_DSN
 * is set. No hardcoded fallback for server — explicit config only.
 */

import * as Sentry from "@sentry/node";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import process from "node:process";
import { scrubEvent } from "./glitchtip-scrub.mjs";

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
  "ingress": "node-proxy",
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

// ---------------------------------------------------------------------------
// Sentry initialization
// ---------------------------------------------------------------------------

const DSN = process.env.GLITCHTIP_NODE_DSN
  || process.env.GLITCHTIP_ORCH_DSN
  || process.env.GLITCHTIP_DSN
  // Fallback to frontend DSN — same project, differentiated by service tag.
  // Server events are distinguished by tags.process and tags.service.
  || process.env.VITE_GLITCHTIP_DSN
  || "";

let initialized = false;

if (DSN) {
  try {
    Sentry.init({
      dsn: DSN,
      release: `grokbot-server@${version}`,
      environment: process.env.GLITCHTIP_ENVIRONMENT || process.env.NODE_ENV || "production",
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
              .replace(/port \d+/g, "port {PORT}")
          ];
        }

        return scrubbed;
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

    console.log(
      `[glitchtip-server] Initialized — release=grokbot-server@${version}, ` +
      `process=${SERVER_NAME}, service=${service}`
    );
  } catch (err) {
    console.error(`[glitchtip-server] Init FAILED: ${err.message}`);
  }
} else {
  // Silent when no DSN — expected in local dev
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { Sentry, initialized as glitchtipInitialized };

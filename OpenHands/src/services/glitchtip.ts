/**
 * GlitchTip error tracking (Sentry-compatible) — CAPTURE EVERYTHING.
 *
 * Initializes the @sentry/browser SDK pointed at the self-hosted GlitchTip
 * instance. Captures:
 *   - Unhandled exceptions (window.onerror)
 *   - Unhandled promise rejections
 *   - React component errors (via ErrorBoundary in root.tsx)
 *   - ALL console.error() calls (via captureConsoleIntegration)
 *   - HTTP 4xx/5xx responses (via httpClientIntegration)
 *   - Network/CORS/fetch failures (via global fetch interceptor)
 *
 * DSN resolution order:
 *   1. window.__OBSERVABILITY_CONFIG__.VITE_GLITCHTIP_DSN  (runtime-injected)
 *   2. import.meta.env.VITE_GLITCHTIP_DSN                 (build-time)
 *   3. hardcoded fallback DSN                              (always works)
 *
 * Session tracking is disabled — GlitchTip doesn't support it.
 */

import * as Sentry from "@sentry/browser";
import {
  captureConsoleIntegration,
  httpClientIntegration,
} from "@sentry/browser";
import { GROKBOT_VERSION } from "#/constants/grokbot-version";
import { isChunkLoadError } from "#/utils/handle-chunk-load-error";

// ---------------------------------------------------------------------------
// Config resolution (mirrors observability-config.ts pattern)
// ---------------------------------------------------------------------------

function getConfig(key: string, fallback = ""): string {
  if (typeof window !== "undefined" && window.__OBSERVABILITY_CONFIG__?.[key]) {
    return window.__OBSERVABILITY_CONFIG__[key];
  }
  const envVal = import.meta.env[key] as string | undefined;
  if (envVal && envVal.length > 0) return envVal;
  return fallback;
}

const GLITCHTIP_DSN = getConfig(
  "VITE_GLITCHTIP_DSN",
  "https://f263a1c8ebe0485f965fb1eeff1a9afe@glitchtip.beenex.cloud/4",
);

const GLITCHTIP_ENVIRONMENT = getConfig(
  "VITE_GLITCHTIP_ENVIRONMENT",
  import.meta.env.DEV ? "development" : "production",
);

// URLs to exclude from HTTP error tracking (prevent infinite loops and noise)
const EXCLUDED_URLS = ["glitchtip.beenex.cloud", "sentry.io"];

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

const isEnabled = Boolean(GLITCHTIP_DSN) && typeof window !== "undefined";

if (isEnabled) {
  Sentry.init({
    dsn: GLITCHTIP_DSN,
    tunnel: "/api/glitchtip-tunnel", // Same-origin tunnel, bypasses ad-blockers
    release: `grokbot@${GROKBOT_VERSION}`,
    environment: GLITCHTIP_ENVIRONMENT,

    // Sample 100% of errors — no performance tracing
    sampleRate: 1.0,
    tracesSampleRate: 0,

    // Noise filters — drop known non-actionable errors
    ignoreErrors: [
      "ResizeObserver loop",
      "AbortError",
      /Loading chunk \d+ failed/,
      "Non-Error exception captured",
      "Non-Error promise rejection captured",
    ],
    denyUrls: [
      /extensions\//i, // Browser extensions
      /^chrome-extension:\/\//i,
      /^moz-extension:\/\//i,
    ],

    integrations: [
      // Capture ALL console.error() calls as Sentry events.
      // This catches handled errors, CORS warnings logged as errors,
      // failed API calls that are caught and console.error'd, etc.
      captureConsoleIntegration({ levels: ["error"] }),

      // Capture HTTP 4xx and 5xx responses as Sentry events.
      // By default this only captures 5xx; we extend to 4xx too.
      httpClientIntegration({
        failedRequestStatusCodes: [[400, 599]],
        failedRequestTargets: [/.*/],
      }),
    ],

    // Filter out noise while keeping everything else
    beforeSend(event, _hint) {
      const errorMessage = event.exception?.values?.[0]?.value ?? "";
      const eventMessage = event.message ?? "";
      const combinedMsg = `${errorMessage} ${eventMessage}`;

      // Drop chunk load errors — we auto-recover from those with page reload
      if (isChunkLoadError(new Error(errorMessage))) {
        return null;
      }

      // Drop events about GlitchTip's own endpoint to avoid infinite loops
      if (combinedMsg.includes("glitchtip.beenex.cloud")) {
        return null;
      }
      // Also drop tunnel endpoint errors
      if (combinedMsg.includes("/api/glitchtip-tunnel")) {
        return null;
      }

      // Scrub secrets from event data (client-side belt-and-suspenders)
      const secretPatterns = [
        /sk-or-v1-[a-f0-9]+/gi,
        /sk-ant-[a-zA-Z0-9_-]+/gi,
        /ship_pat_[a-zA-Z0-9]+/gi,
        /gf_[a-f0-9]{20,}/gi,
        /Bearer\s+[^\s"']+/gi,
        /session_api_key=[^\s&"']+/gi,
      ];
      const scrub = (str: string): string => {
        let result = str;
        for (const p of secretPatterns) {
          p.lastIndex = 0;
          result = result.replace(p, "[REDACTED]");
        }
        return result;
      };

      // Scrub exception values
      event.exception?.values?.forEach((v) => {
        if (v.value) {
          // eslint-disable-next-line no-param-reassign
          v.value = scrub(v.value);
        }
      });
      // Scrub breadcrumbs
      if (event.breadcrumbs) {
        for (const b of event.breadcrumbs) {
          // eslint-disable-next-line no-param-reassign
          if (b.message) b.message = scrub(b.message);
        }
      }
      // eslint-disable-next-line no-param-reassign
      if (event.message) event.message = scrub(event.message);

      // Scrub request headers
      if (event.request?.headers) {
        const sensitiveHeaders = [
          "authorization",
          "x-session-api-key",
          "cookie",
        ];
        for (const h of sensitiveHeaders) {
          // eslint-disable-next-line no-param-reassign
          if (event.request.headers[h]) event.request.headers[h] = "[REDACTED]";
        }
      }

      return event;
    },

    // Keep breadcrumbs for observability endpoints — useful debugging context.
    // Only filter out GlitchTip's own requests to avoid infinite breadcrumb loops.
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === "xhr" || breadcrumb.category === "fetch") {
        const url = breadcrumb.data?.url as string | undefined;
        if (
          url &&
          (url.includes("glitchtip.beenex.cloud") ||
            url.includes("/api/glitchtip-tunnel"))
        ) {
          return null;
        }
      }
      return breadcrumb;
    },
  });

  // ─── Replay buffered pre-init errors ──────────────────────────────────
  // The pre-init buffer in the injected <script> captures errors that fire
  // before this module loads (e.g. during chunk loading).
  const sentryBuffer = (
    window as unknown as { __SENTRY_BUFFER__?: ErrorEvent[] }
  ).__SENTRY_BUFFER__;
  if (Array.isArray(sentryBuffer) && sentryBuffer.length > 0) {
    for (const e of sentryBuffer) {
      if ("error" in e && e.error) {
        Sentry.captureException(e.error);
      } else if ("reason" in e) {
        Sentry.captureException(
          (e as unknown as PromiseRejectionEvent).reason,
        );
      } else {
        Sentry.captureException(e);
      }
    }
    (
      window as unknown as { __SENTRY_BUFFER__?: ErrorEvent[] }
    ).__SENTRY_BUFFER__ = [];
  }

  // -------------------------------------------------------------------------
  // Global fetch interceptor — capture network/CORS failures
  // -------------------------------------------------------------------------
  // httpClientIntegration handles HTTP status errors, but CORS blocks and
  // network failures throw TypeError before any response is received.
  // This interceptor catches those.
  const originalFetch = window.fetch;
  window.fetch = async function patchedFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    // Skip GlitchTip's own requests
    if (EXCLUDED_URLS.some((excluded) => url.includes(excluded))) {
      return originalFetch.call(window, input, init);
    }

    try {
      const response = await originalFetch.call(window, input, init);
      return response;
    } catch (fetchError) {
      // Network failure / CORS block / DNS failure — these are TypeError
      Sentry.captureException(fetchError, {
        tags: {
          error_type: "fetch_network_error",
          fetch_url: url.substring(0, 200), // Truncate long URLs
        },
        extra: {
          method: init?.method ?? "GET",
          url: url.substring(0, 500),
        },
      });
      throw fetchError; // Re-throw so calling code still handles it normally
    }
  };

  console.debug(
    `[glitchtip] Initialized — release=grokbot@${GROKBOT_VERSION}, env=${GLITCHTIP_ENVIRONMENT}`,
    "Capturing: unhandled exceptions, console.error, HTTP 4xx/5xx, fetch failures",
  );
} else {
  console.debug("[glitchtip] Disabled — no DSN configured or SSR context");
}

// ---------------------------------------------------------------------------
// Exports for manual error capture
// ---------------------------------------------------------------------------

/**
 * Manually capture an error and send it to GlitchTip.
 * Safe to call even when GlitchTip is disabled (no-ops gracefully).
 */
export function captureError(
  error: Error,
  context?: Record<string, unknown>,
): void {
  if (!isEnabled) return;
  if (context) {
    Sentry.withScope((scope) => {
      scope.setExtras(context);
      Sentry.captureException(error);
    });
  } else {
    Sentry.captureException(error);
  }
}

/**
 * Capture a message (non-exception) to GlitchTip.
 * Use for warnings, notices, or custom events.
 */
export function captureMessage(
  message: string,
  level: "fatal" | "error" | "warning" | "info" | "debug" = "error",
  context?: Record<string, unknown>,
): void {
  if (!isEnabled) return;
  if (context) {
    Sentry.withScope((scope) => {
      scope.setExtras(context);
      Sentry.captureMessage(message, level);
    });
  } else {
    Sentry.captureMessage(message, level);
  }
}

/**
 * Set user context for GlitchTip error reports.
 */
export function setGlitchTipUser(user: {
  id?: string;
  email?: string;
  username?: string;
}): void {
  if (!isEnabled) return;
  Sentry.setUser(user);
}

/**
 * Add a breadcrumb for debugging context.
 */
export function addBreadcrumb(
  message: string,
  category?: string,
  data?: Record<string, unknown>,
): void {
  if (!isEnabled) return;
  Sentry.addBreadcrumb({ message, category, data, level: "info" });
}

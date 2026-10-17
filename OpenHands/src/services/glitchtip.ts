/**
 * GlitchTip error tracking (Sentry-compatible).
 *
 * Initializes the @sentry/react SDK pointed at the self-hosted GlitchTip
 * instance. This captures unhandled exceptions, unhandled promise rejections,
 * and React component errors via the ErrorBoundary integration.
 *
 * DSN resolution order:
 *   1. window.__OBSERVABILITY_CONFIG__.VITE_GLITCHTIP_DSN  (runtime-injected)
 *   2. import.meta.env.VITE_GLITCHTIP_DSN                 (build-time)
 *   3. hardcoded fallback DSN                              (always works)
 *
 * Session tracking is disabled — GlitchTip doesn't support it.
 * Session Replay and advanced Sentry profiling are also omitted.
 */

import * as Sentry from "@sentry/browser";
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

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

const isEnabled = Boolean(GLITCHTIP_DSN) && typeof window !== "undefined";

if (isEnabled) {
  Sentry.init({
    dsn: GLITCHTIP_DSN,
    release: `grokbot@${GROKBOT_VERSION}`,
    environment: GLITCHTIP_ENVIRONMENT,

    // Sample 100% of errors — no performance tracing (GlitchTip has
    // limited tracing support and browserTracingIntegration is incompatible
    // with the Vite/React Router bundle in production).
    sampleRate: 1.0,
    tracesSampleRate: 0,

    // Use only the default integrations (global error handlers, breadcrumbs,
    // console, HTTP context). Explicitly skip browser tracing.

    // Filter out chunk load errors — we handle those with automatic reload
    beforeSend(event) {
      const errorMessage = event.exception?.values?.[0]?.value ?? "";
      if (isChunkLoadError(new Error(errorMessage))) {
        return null; // Drop chunk load errors, we auto-recover from those
      }
      return event;
    },

    // Don't send breadcrumbs for noisy observability endpoints
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === "xhr" || breadcrumb.category === "fetch") {
        const url = breadcrumb.data?.url as string | undefined;
        if (
          url &&
          (url.includes("/api/langfuse") ||
            url.includes("posthog.com") ||
            url.includes("comet.com") ||
            url.includes("langwatch.ai") ||
            url.includes("raindrop.ai") ||
            url.includes("glitchtip.beenex.cloud"))
        ) {
          return null;
        }
      }
      return breadcrumb;
    },
  });

  console.debug(
    `[glitchtip] Initialized — release=grokbot@${GROKBOT_VERSION}, env=${GLITCHTIP_ENVIRONMENT}`,
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



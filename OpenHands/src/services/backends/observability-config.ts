/**
 * Observability backend configuration.
 *
 * Values are resolved in this order:
 *   1. window.__OBSERVABILITY_CONFIG__  (runtime-injected by static-server.mjs)
 *   2. import.meta.env.VITE_*           (build-time from .env / Docker ARGs)
 *   3. hardcoded fallback               (defaults)
 *
 * The runtime injection path (#1) is the primary mechanism in production:
 * the static server reads env vars set by Coolify and injects them into
 * index.html as a <script> tag BEFORE any app code runs. This avoids the
 * need for Coolify's Docker --build-arg injection (which proved unreliable).
 *
 * NOTE: These are client-side write-only collector/ingest keys.
 * They only allow sending telemetry data to the respective services.
 */

declare global {
  interface Window {
    __OBSERVABILITY_CONFIG__?: Record<string, string>;
  }
}

function getConfig(key: string, fallback = ""): string {
  // 1. Runtime injection (highest priority — always works)
  if (typeof window !== "undefined" && window.__OBSERVABILITY_CONFIG__?.[key]) {
    return window.__OBSERVABILITY_CONFIG__[key];
  }

  // 2. Vite build-time env var (works when .env exists during npm run build)
  const envVal = import.meta.env[key] as string | undefined;
  if (envVal && envVal.length > 0) return envVal;

  // 3. Hardcoded fallback
  return fallback;
}

// ─── Opik (Comet) ─────────────────────────────────────────────────────────
export const OPIK_API_KEY = getConfig(
  "VITE_OPIK_API_KEY",
  "BQr4JlCiiNlMR8x3raGyTDUtn",
);
export const OPIK_BASE_URL = getConfig(
  "VITE_OPIK_BASE_URL",
  "https://www.comet.com/opik/api",
);
export const OPIK_WORKSPACE = getConfig("VITE_OPIK_WORKSPACE");

// ─── Langwatch ────────────────────────────────────────────────────────────
export const LANGWATCH_API_KEY = getConfig(
  "VITE_LANGWATCH_API_KEY",
  "sk-lw-Wvsoy6ulq3QYtMFH_O5X2dD2Z1XVtMNDsHNBQw5DvYqxMmgSUmuQXhw7w9gMYnf9t",
);
export const LANGWATCH_BASE_URL = getConfig(
  "VITE_LANGWATCH_BASE_URL",
  "https://app.langwatch.ai",
);

// ─── PostHog AI ───────────────────────────────────────────────────────────
const posthogVal = getConfig("VITE_POSTHOG_AI_ENABLED", "true");
export const POSTHOG_AI_ENABLED = posthogVal !== "false" && posthogVal !== "0";

// ─── Raindrop ─────────────────────────────────────────────────────────────
export const RAINDROP_WRITE_KEY =
  getConfig("VITE_RAINDROP_WRITE_KEY") ||
  getConfig("RAINDROP_WRITE_KEY", "35699173-1136-4b61-b748-02e3722ccebe");
export const RAINDROP_PROJECT_ID =
  getConfig("VITE_RAINDROP_PROJECT_ID") || getConfig("RAINDROP_PROJECT_ID");
export const RAINDROP_BASE_URL = getConfig(
  "VITE_RAINDROP_BASE_URL",
  "https://api.raindrop.ai/v1/",
);

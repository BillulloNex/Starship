/**
 * Observability backend configuration.
 *
 * At build time, the Dockerfile writes a .env file from Coolify build-args.
 * Vite then statically replaces `import.meta.env.VITE_*` references.
 *
 * This config module acts as the single source of truth for all backend
 * credentials, providing sensible defaults when env vars are not set
 * (e.g. during local dev without a .env file).
 *
 * NOTE: These are client-side write-only collector/ingest keys.
 * They only allow sending telemetry data to the respective services.
 * They do NOT grant read/admin access. They are safe to embed in the
 * client bundle — any visitor can see them in the browser DevTools.
 */

// Vite statically replaces import.meta.env.VITE_* at build time.
// If Coolify build-args are passed correctly, these will have real values.
// If not, the fallback strings below are used.

function envOr(envVal: string | undefined, fallback: string): string {
  // Vite replaces import.meta.env.VITE_X with the literal string or `undefined`.
  // An empty string means the ARG was passed but empty.
  if (envVal && envVal.length > 0) return envVal;
  return fallback;
}

// ─── Opik (Comet) ─────────────────────────────────────────────────────────
export const OPIK_API_KEY = envOr(
  import.meta.env.VITE_OPIK_API_KEY,
  "",
);
export const OPIK_BASE_URL = envOr(
  import.meta.env.VITE_OPIK_BASE_URL,
  "https://www.comet.com/opik/api",
);
export const OPIK_WORKSPACE = import.meta.env.VITE_OPIK_WORKSPACE || "";

// ─── Langwatch ────────────────────────────────────────────────────────────
export const LANGWATCH_API_KEY = envOr(
  import.meta.env.VITE_LANGWATCH_API_KEY,
  "",
);
export const LANGWATCH_BASE_URL = envOr(
  import.meta.env.VITE_LANGWATCH_BASE_URL,
  "https://app.langwatch.ai",
);

// ─── PostHog AI ───────────────────────────────────────────────────────────
export const POSTHOG_AI_ENABLED =
  import.meta.env.VITE_POSTHOG_AI_ENABLED === "true" ||
  import.meta.env.VITE_POSTHOG_AI_ENABLED === "1";

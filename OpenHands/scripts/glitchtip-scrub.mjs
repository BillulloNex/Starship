/**
 * GlitchTip event scrubber — strips secrets, PII, and sensitive content.
 *
 * Shared by all Node.js Sentry SDK instances (static-server, ingress,
 * orchestrators). The Python equivalent lives in sitecustomize.py.
 *
 * MUST be loaded before any SDK sends data.
 */

// Patterns that match known secret formats in logs, stack traces, breadcrumbs.
const SECRET_PATTERNS = [
  /sk-or-v1-[a-f0-9]+/gi,                // OpenRouter API keys
  /sk-ant-[a-zA-Z0-9_-]+/gi,             // Anthropic API keys
  /sk-proj-[a-zA-Z0-9_-]+/gi,            // OpenAI project keys
  /sk-[a-zA-Z0-9]{20,}/gi,               // Generic sk- prefixed keys
  /ship_pat_[a-zA-Z0-9]+/gi,             // Starship PAT tokens
  /gf_[a-f0-9]{20,}/gi,                  // GitFlare API keys
  /Bearer\s+[^\s"']+/gi,                 // Bearer tokens in logs
  /session_api_key=[^\s&"']+/gi,         // URL query session keys
  /X-Session-API-Key:\s*[^\s"']+/gi,     // Header values in logs
  /token=[^\s&"']+/gi,                   // Generic token params
  /AIza[a-zA-Z0-9_-]{35}/gi,            // Google API keys
  /glpat-[a-zA-Z0-9_-]+/gi,             // GitLab PATs
  /ghp_[a-zA-Z0-9]{36}/gi,              // GitHub PATs
  /gho_[a-zA-Z0-9]{36}/gi,              // GitHub OAuth tokens
  /ghr_[a-zA-Z0-9]{36}/gi,              // GitHub refresh tokens
  /xoxb-[a-zA-Z0-9-]+/gi,              // Slack bot tokens
  /DD_API_KEY=\S+/gi,                    // Datadog keys in env dumps
  /RESEND_API_KEY=\S+/gi,               // Resend email API keys
];

// Headers that must never appear in event payloads.
const SCRUB_HEADERS = new Set([
  "authorization",
  "x-session-api-key",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-sentry-auth",
  "x-glitchtip-auth",
  "proxy-authorization",
]);

/**
 * Scrub a string of any secret patterns.
 * @param {string} s
 * @returns {string}
 */
function scrubStr(s) {
  if (typeof s !== "string") return s;
  for (const p of SECRET_PATTERNS) {
    // Reset lastIndex since we reuse global regexes
    p.lastIndex = 0;
    s = s.replace(p, "[REDACTED]");
  }
  return s;
}

/**
 * Scrub a Sentry event before sending to GlitchTip.
 *
 * Mutates the event in place for efficiency, returns the event.
 * Return null to drop the event entirely.
 *
 * @param {object} event - Sentry event object
 * @returns {object|null}
 */
export function scrubEvent(event) {
  // 1. Scrub request headers
  if (event.request?.headers) {
    for (const h of Object.keys(event.request.headers)) {
      if (SCRUB_HEADERS.has(h.toLowerCase())) {
        event.request.headers[h] = "[REDACTED]";
      }
    }
  }

  // 2. Scrub request query string
  if (event.request?.query_string) {
    event.request.query_string = event.request.query_string
      .replace(/session_api_key=[^&]+/g, "session_api_key=[REDACTED]")
      .replace(/token=[^&]+/g, "token=[REDACTED]")
      .replace(/api_key=[^&]+/g, "api_key=[REDACTED]");
  }

  // 3. Scrub request data/body
  if (event.request?.data && typeof event.request.data === "string") {
    event.request.data = scrubStr(event.request.data);
  }

  // 4. Scrub exception values
  if (event.exception?.values) {
    for (const v of event.exception.values) {
      if (v.value) v.value = scrubStr(v.value);
      // Scrub stack frame local variables (should be off, but belt-and-suspenders)
      if (v.stacktrace?.frames) {
        for (const frame of v.stacktrace.frames) {
          if (frame.vars) {
            for (const [key, val] of Object.entries(frame.vars)) {
              if (typeof val === "string") {
                frame.vars[key] = scrubStr(val);
              }
            }
          }
        }
      }
    }
  }

  // 5. Scrub breadcrumbs
  if (event.breadcrumbs?.values) {
    for (const b of event.breadcrumbs.values) {
      if (b.message) b.message = scrubStr(b.message);
      if (b.data) {
        for (const [key, val] of Object.entries(b.data)) {
          if (typeof val === "string") {
            b.data[key] = scrubStr(val);
          }
        }
      }
    }
  }

  // 6. Scrub event message
  if (event.message) event.message = scrubStr(event.message);

  // 7. Scrub extra context
  if (event.extra) {
    for (const [key, val] of Object.entries(event.extra)) {
      if (typeof val === "string") {
        event.extra[key] = scrubStr(val);
      }
    }
  }

  return event;
}

/**
 * Test helper — expose patterns for unit tests.
 */
export { SECRET_PATTERNS, SCRUB_HEADERS, scrubStr };

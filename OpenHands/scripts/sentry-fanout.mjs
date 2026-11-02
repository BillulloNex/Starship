/**
 * Sentry fan-out — mirrors GlitchTip error events to Sentry SaaS.
 *
 * GlitchTip stays the primary sink (it drives the auto-fix webhook). When
 * SENTRY_DSN is set, the same events are also sent to Sentry:
 *   - Browser: the same-origin tunnel forwards each envelope to both.
 *   - Node:    glitchtip-server.mjs uses a multiplexed transport.
 *   - Python:  sitecustomize.py wraps its transport (reads SENTRY_DSN itself).
 *
 * Unset SENTRY_DSN = no Sentry traffic at all.
 */

import process from "node:process";

export function getSentryDsn(env = process.env) {
  return (env.SENTRY_DSN || "").trim();
}

/**
 * Envelope ingest URL for a DSN, derived only from server config — never from
 * the incoming envelope, so the tunnel can't be pointed at an arbitrary host.
 * Returns null for a malformed DSN.
 */
export function sentryEnvelopeUrl(dsn) {
  let url;
  try {
    url = new URL(dsn);
  } catch {
    return null;
  }
  const segments = url.pathname.split("/").filter(Boolean);
  const projectId = segments.pop();
  if (!url.username || !projectId || !/^\d+$/.test(projectId)) return null;
  const prefix = segments.length ? `/${segments.join("/")}` : "";
  return (
    `${url.protocol}//${url.host}${prefix}/api/${projectId}/envelope/` +
    `?sentry_key=${encodeURIComponent(url.username)}&sentry_version=7`
  );
}

/**
 * Returns a copy of the envelope whose header names `dsn` instead of the
 * browser's GlitchTip DSN. Items are passed through byte-for-byte.
 */
export function rewriteEnvelopeDsn(body, dsn) {
  const nlIdx = body.indexOf(10);
  if (nlIdx < 0) return null;
  let header;
  try {
    header = JSON.parse(body.toString("utf8", 0, nlIdx));
  } catch {
    return null;
  }
  header.dsn = dsn;
  return Buffer.concat([
    Buffer.from(JSON.stringify(header), "utf8"),
    body.subarray(nlIdx),
  ]);
}

/**
 * Fire-and-forget mirror of a tunnel envelope to Sentry. Never throws and
 * never affects the GlitchTip response.
 */
export function mirrorEnvelopeToSentry(
  body,
  { env = process.env, fetchImpl = fetch } = {},
) {
  const dsn = getSentryDsn(env);
  if (!dsn) return null;
  const url = sentryEnvelopeUrl(dsn);
  const rewritten = url && rewriteEnvelopeDsn(body, dsn);
  if (!rewritten) return null;
  return fetchImpl(url, {
    method: "POST",
    body: rewritten,
    headers: { "Content-Type": "application/x-sentry-envelope" },
  }).catch(() => null);
}

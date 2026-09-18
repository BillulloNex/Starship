import { getDatadogRum } from "#/components/providers/datadog-provider";

/**
 * Lightweight client-side latency tracking. Wraps the native Performance API
 * and forwards durations to Datadog RUM as custom actions (`perf.<name>`) so
 * they show up alongside existing RUM sessions/errors. No-ops safely when
 * Datadog isn't configured (local dev) or `performance` is unavailable (SSR).
 */

export function markPerf(name: string): void {
  try {
    performance.mark(name);
  } catch {
    // performance.mark can throw in unsupported environments; tracking is
    // best-effort and must never break the app.
  }
}

/** Sends a duration (ms) to Datadog RUM as a custom action. */
export function trackDuration(
  name: string,
  durationMs: number,
  context?: Record<string, string | number | boolean>,
): void {
  const rum = getDatadogRum();
  rum?.addAction(`perf.${name}`, { duration: durationMs, ...context });
}

/**
 * Measures the gap between two marks (via the Performance API) and reports
 * it to Datadog RUM. Returns the duration, or null if either mark is missing.
 */
export function measurePerf(
  name: string,
  startMark: string,
  endMark?: string,
  context?: Record<string, string | number | boolean>,
): number | null {
  try {
    const entry = performance.measure(name, startMark, endMark);
    trackDuration(name, entry.duration, context);
    return entry.duration;
  } catch {
    return null;
  }
}

/** Times an async function and reports its duration under `name`, even on error. */
export async function trackAsyncDuration<T>(
  name: string,
  fn: () => Promise<T>,
  context?: Record<string, string | number | boolean>,
): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    trackDuration(name, performance.now() - start, context);
  }
}

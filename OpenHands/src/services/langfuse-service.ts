import { displayWarningToast } from "#/utils/custom-toast-handlers";

import { GROKBOT_VERSION } from "#/constants/grokbot-version";
import {
  LANGFUSE_PUBLIC_KEY,
  LANGFUSE_BASE_URL,
} from "./backends/observability-config";

// Keys resolve in order: window.__OBSERVABILITY_CONFIG__ (runtime) -> import.meta.env (build-time).
// When unset, browser-side tracing disables itself; the server-side OTEL path
// (docker/entrypoint.sh) still traces all models.
//
// NOTE: The secret key is NOT available client-side. All OTLP spans are sent
// via the same-origin backend proxy at /api/observability/langfuse/otel which
// handles auth server-side. This eliminates CORS issues and keeps secrets safe.
const publicKey = LANGFUSE_PUBLIC_KEY || undefined;
const baseUrl = LANGFUSE_BASE_URL || undefined;

// ---------------------------------------------------------------------------
// Failure tracking — throttled so we don't spam the user with toasts
// ---------------------------------------------------------------------------
let lastWarningTs = 0;
const WARNING_COOLDOWN_MS = 30_000; // show at most one warning every 30s

function warnLangfuseFailure(context: string, err: unknown) {
  const msg =
    err instanceof Error ? err.message : String(err ?? "unknown error");
  console.warn(`Langfuse ${context} error:`, err);

  const now = Date.now();
  if (now - lastWarningTs > WARNING_COOLDOWN_MS) {
    lastWarningTs = now;
    displayWarningToast(`Langfuse ${context} failed: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export function getLangfuseBaseUrl(): string {
  return (baseUrl ?? "").replace(/\/$/, "");
}

export function isLangfuseEnabled(): boolean {
  return Boolean(publicKey && baseUrl);
}

// ---------------------------------------------------------------------------
// Native OTLP ingestion for Langfuse v4
//
// Spans go to /api/public/otel/v1/traces (via the same-origin proxy) with
// `x-langfuse-ingestion-version: 4`. Each observation is exported exactly once
// as a complete span, and trace-wide attributes (session, trace name,
// environment, release) are copied onto every span so they stay filterable in
// the observations-first data model.
// See https://langfuse.com/integrations/native/opentelemetry/migration-to-v4
// ---------------------------------------------------------------------------

const TRACE_NAME = "Starship Conversation";
const LANGFUSE_ENVIRONMENT = import.meta.env.PROD
  ? "production"
  : "development";

function toTraceId(id: string): string {
  const clean = id.replace(/[^a-fA-F0-9]/g, "").toLowerCase();
  if (clean.length === 32) return clean;
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < id.length; i++) {
    const ch = id.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const part1 = (h1 >>> 0).toString(16).padStart(8, "0");
  const part2 = (h2 >>> 0).toString(16).padStart(8, "0");
  return (clean + part1 + part2 + "0123456789abcdef0123456789abcdef").slice(
    0,
    32,
  );
}

function generateSpanId(): string {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const buf = new Uint8Array(8);
    crypto.getRandomValues(buf);
    return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return Math.random().toString(16).slice(2).padStart(16, "0").slice(0, 16);
}

/** Epoch milliseconds → OTLP nanosecond string, without float precision loss. */
function msToUnixNano(ms: number): string {
  return (BigInt(Math.floor(ms)) * BigInt(1_000_000)).toString();
}

function serialize(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

// Rough average for English text and code; only used when a provider
// (Cursor ACP) reports no usage, so the estimate misses hidden reasoning,
// tool calls, and the provider's own system prompt.
const ESTIMATED_CHARS_PER_TOKEN = 4;

function estimateTokens(value: unknown): number {
  if (value === undefined || value === null) return 0;
  return Math.ceil(serialize(value).length / ESTIMATED_CHARS_PER_TOKEN);
}

interface OtlpAttribute {
  key: string;
  value: Record<string, unknown>;
}

function str(key: string, value: string): OtlpAttribute {
  return { key, value: { stringValue: value } };
}

/** Trace-wide attributes that must be present on every observation in v4. */
function traceContextAttributes(conversationId: string): OtlpAttribute[] {
  return [
    str("langfuse.session.id", conversationId),
    str("langfuse.trace.name", TRACE_NAME),
    str("langfuse.environment", LANGFUSE_ENVIRONMENT),
    str("langfuse.release", GROKBOT_VERSION),
    str("langfuse.trace.metadata.client", "Starship Agent Canvas"),
  ];
}

interface OtlpSpan {
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTimeMs: number;
  endTimeMs: number;
  attributes: OtlpAttribute[];
  isError?: boolean;
  statusMessage?: string;
}

export function buildOtlpPayload(traceId: string, spans: OtlpSpan[]) {
  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            str("service.name", "starship-agent-canvas"),
            str("service.version", GROKBOT_VERSION),
            str("deployment.environment.name", LANGFUSE_ENVIRONMENT),
          ],
        },
        scopeSpans: [
          {
            scope: { name: "starship.observability", version: GROKBOT_VERSION },
            spans: spans.map((s) => ({
              traceId,
              spanId: s.spanId,
              parentSpanId: s.parentSpanId,
              name: s.name,
              kind: 1,
              flags: 1,
              startTimeUnixNano: msToUnixNano(s.startTimeMs),
              endTimeUnixNano: msToUnixNano(s.endTimeMs),
              attributes: s.attributes,
              // OTLP StatusCode: 1 = OK, 2 = ERROR
              status: s.isError
                ? { code: 2, message: s.statusMessage ?? "" }
                : { code: 1 },
            })),
          },
        ],
      },
    ],
  };
}

async function sendOtlpSpans(
  traceId: string,
  spans: OtlpSpan[],
): Promise<boolean> {
  if (!isLangfuseEnabled()) return false;

  try {
    // Send to same-origin backend proxy — no CORS, no client-side secrets.
    // The proxy at /api/observability/langfuse/otel forwards to Langfuse
    // with server-side Basic Auth and the v4 ingestion header.
    // eslint-disable-next-line local/no-direct-agent-server-fetch
    const res = await fetch("/api/observability/langfuse/otel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildOtlpPayload(traceId, spans)),
    });
    if (!res.ok) {
      warnLangfuseFailure("sendOtlpSpans", new Error(`HTTP ${res.status}`));
    }
    return res.ok;
  } catch (err) {
    warnLangfuseFailure("sendOtlpSpans", err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Per-turn deltas
//
// The agent-server reports *accumulated* tokens and cost per conversation and
// model. Langfuse sums generation usage/cost across a session, so exporting
// running totals would inflate session cost quadratically. Track the last
// totals per conversation+model and export only the delta for each turn.
// ---------------------------------------------------------------------------

interface UsageTotals {
  cost: number;
  promptTokens: number;
  completionTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
}

const lastTotals = new Map<string, UsageTotals>();

function toDelta(key: string, totals: UsageTotals): UsageTotals {
  const prev = lastTotals.get(key);
  lastTotals.set(key, totals);
  if (!prev) return totals;
  // A counter going backwards means the server reset its totals (e.g. a new
  // agent-server process); treat the new totals as this turn's usage.
  if (
    totals.promptTokens < prev.promptTokens ||
    totals.completionTokens < prev.completionTokens ||
    totals.cost < prev.cost
  ) {
    return totals;
  }
  const d = (a: number, b: number) => Math.max(0, a - b);
  return {
    cost: d(totals.cost, prev.cost),
    promptTokens: d(totals.promptTokens, prev.promptTokens),
    completionTokens: d(totals.completionTokens, prev.completionTokens),
    cacheReadTokens: d(totals.cacheReadTokens, prev.cacheReadTokens),
    cacheWriteTokens: d(totals.cacheWriteTokens, prev.cacheWriteTokens),
    reasoningTokens: d(totals.reasoningTokens, prev.reasoningTokens),
  };
}

/** Test-only: forget accumulated totals between test cases. */
export function resetLangfuseUsageTotals() {
  lastTotals.clear();
}

// ---------------------------------------------------------------------------
// Generation recording (original API — kept for backward compat)
// ---------------------------------------------------------------------------

export interface RecordGenerationOptions {
  traceId?: string;
  conversationId: string;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  cost?: number;
  input?: unknown;
  output?: unknown;
  startTime?: Date;
  endTime?: Date;
}

export function recordGeneration({
  traceId,
  conversationId,
  model = "grok-bot-agent",
  promptTokens = 0,
  completionTokens = 0,
  cost,
  input,
  output,
}: RecordGenerationOptions) {
  recordStatsGeneration({
    conversationId,
    generationId: traceId,
    modelName: model,
    accumulatedCost: cost ?? 0,
    promptTokens,
    completionTokens,
    input,
    output,
  });
}

// ---------------------------------------------------------------------------
// Stats-based generation recording — wired into the WebSocket event handler
// ---------------------------------------------------------------------------

export interface RecordStatsGenerationOptions {
  conversationId: string;
  generationId?: string;
  modelName: string;
  executionProvider?: string;
  /** Accumulated conversation cost for this model, as reported by the server. */
  accumulatedCost: number;
  /** Accumulated prompt tokens for this model, as reported by the server. */
  promptTokens: number;
  /** Accumulated completion tokens for this model, as reported by the server. */
  completionTokens: number;
  usageAvailable?: boolean;
  costAvailable?: boolean;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
  responseLatencies?: Array<{
    model: string;
    latency: number;
    response_id: string;
  }>;
  input?: unknown;
  output?: unknown;
}

/**
 * Records an LLM generation derived from the v1 agent-server
 * `ConversationStateUpdateEvent` with `key: "stats"`.
 *
 * Exported as a single complete v4 OTLP `generation` span carrying this
 * turn's input/output, per-turn usage and cost, and the propagated
 * session/trace attributes.
 */
export function recordStatsGeneration({
  conversationId,
  generationId,
  modelName,
  executionProvider,
  accumulatedCost,
  promptTokens,
  completionTokens,
  usageAvailable,
  costAvailable,
  cacheReadTokens,
  cacheWriteTokens,
  reasoningTokens,
  responseLatencies,
  input,
  output,
}: RecordStatsGenerationOptions) {
  if (!isLangfuseEnabled()) return;

  const traceId = toTraceId(conversationId);

  const nowMs = Date.now();
  const lastLatency = responseLatencies?.length
    ? responseLatencies[responseLatencies.length - 1]
    : null;
  const durationMs = lastLatency ? lastLatency.latency * 1000 : 1000;

  const turn = toDelta(`${conversationId}\u0000${modelName}`, {
    cost: accumulatedCost,
    promptTokens,
    completionTokens,
    cacheReadTokens: cacheReadTokens ?? 0,
    cacheWriteTokens: cacheWriteTokens ?? 0,
    reasoningTokens: reasoningTokens ?? 0,
  });

  const attributes: OtlpAttribute[] = [
    ...traceContextAttributes(conversationId),
    str("langfuse.observation.type", "generation"),
    str("langfuse.observation.model.name", modelName),
  ];

  if (input !== undefined && input !== null) {
    attributes.push(str("langfuse.observation.input", serialize(input)));
  }

  if (output !== undefined && output !== null) {
    attributes.push(str("langfuse.observation.output", serialize(output)));
  }

  if (usageAvailable !== false) {
    const usageDetails: Record<string, number> = {
      input: turn.promptTokens,
      output: turn.completionTokens,
      total: turn.promptTokens + turn.completionTokens,
    };
    if (turn.cacheReadTokens) {
      usageDetails.cache_read_input_tokens = turn.cacheReadTokens;
    }
    if (turn.cacheWriteTokens) {
      usageDetails.cache_creation_input_tokens = turn.cacheWriteTokens;
    }
    if (turn.reasoningTokens) {
      usageDetails.reasoning_tokens = turn.reasoningTokens;
    }
    attributes.push(
      str("langfuse.observation.usage_details", JSON.stringify(usageDetails)),
    );
  } else {
    const estimatedInput = estimateTokens(input);
    const estimatedOutput = estimateTokens(output);
    if (estimatedInput || estimatedOutput) {
      attributes.push(
        str(
          "langfuse.observation.usage_details",
          JSON.stringify({
            input: estimatedInput,
            output: estimatedOutput,
            total: estimatedInput + estimatedOutput,
          }),
        ),
        str("langfuse.observation.metadata.usageEstimated", "true"),
      );
    }
  }

  if (costAvailable !== false && turn.cost > 0) {
    attributes.push(
      str(
        "langfuse.observation.cost_details",
        JSON.stringify({ total: turn.cost }),
      ),
    );
  }

  if (executionProvider) {
    attributes.push(
      str("langfuse.observation.metadata.executionProvider", executionProvider),
    );
  }

  if (generationId) {
    attributes.push(
      str("langfuse.observation.metadata.generationId", generationId),
    );
  }

  sendOtlpSpans(traceId, [
    {
      spanId: generateSpanId(),
      name: "LLM Generation",
      startTimeMs: nowMs - durationMs,
      endTimeMs: nowMs,
      attributes,
    },
  ]).catch((err) => {
    warnLangfuseFailure("sendOtlpSpans (recordStatsGeneration)", err);
  });
}

// ---------------------------------------------------------------------------
// MCP tool call recording
// ---------------------------------------------------------------------------

export interface RecordMcpToolOptions {
  traceId?: string;
  conversationId: string;
  toolName: string;
  serverName?: string;
  input?: unknown;
  output?: unknown;
  durationMs: number;
  status?: "SUCCESS" | "ERROR";
  errorMessage?: string;
}

export function recordMcpToolCall({
  traceId,
  conversationId,
  toolName,
  serverName = "default",
  input,
  output,
  durationMs,
  status = "SUCCESS",
  errorMessage,
}: RecordMcpToolOptions) {
  if (!isLangfuseEnabled()) return;

  const tid = toTraceId(traceId || conversationId);
  const nowMs = Date.now();
  const isError = status === "ERROR" || Boolean(errorMessage);

  const attributes: OtlpAttribute[] = [
    ...traceContextAttributes(conversationId),
    str("langfuse.observation.type", "tool"),
    str("langfuse.observation.metadata.serverName", serverName),
    str("langfuse.observation.metadata.status", status),
  ];

  if (input !== undefined && input !== null) {
    attributes.push(str("langfuse.observation.input", serialize(input)));
  }

  if (output !== undefined && output !== null) {
    const outputPayload =
      status === "ERROR" ? { error: errorMessage, output } : output;
    attributes.push(
      str("langfuse.observation.output", serialize(outputPayload)),
    );
  }

  if (isError) {
    attributes.push(str("langfuse.observation.level", "ERROR"));
    if (errorMessage) {
      attributes.push(str("langfuse.observation.status_message", errorMessage));
    }
  }

  sendOtlpSpans(tid, [
    {
      spanId: generateSpanId(),
      name: `MCP Tool: ${toolName}`,
      startTimeMs: nowMs - Math.max(0, durationMs),
      endTimeMs: nowMs,
      attributes,
      isError,
      statusMessage: errorMessage,
    },
  ]).catch((err) => {
    warnLangfuseFailure("sendOtlpSpans (recordMcpToolCall)", err);
  });
}

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

export function getLangfuseSessionUrl(conversationId: string): string {
  const base = getLangfuseBaseUrl();
  return `${base}/sessions/${conversationId}`;
}

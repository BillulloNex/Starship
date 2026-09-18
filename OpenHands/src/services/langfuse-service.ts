import { Langfuse } from "langfuse";
import { displayWarningToast } from "#/utils/custom-toast-handlers";

import {
  LANGFUSE_PUBLIC_KEY,
  LANGFUSE_SECRET_KEY,
  LANGFUSE_BASE_URL,
} from "./backends/observability-config";

// Keys resolve in order: window.__OBSERVABILITY_CONFIG__ (runtime) -> import.meta.env (build-time).
// When unset, browser-side tracing disables itself; the server-side OTEL path
// (docker/entrypoint.sh) still traces all models.
const publicKey = LANGFUSE_PUBLIC_KEY || undefined;
const secretKey = LANGFUSE_SECRET_KEY || undefined;
const baseUrl = LANGFUSE_BASE_URL || undefined;

let langfuseInstance: Langfuse | null = null;

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
// Core client
// ---------------------------------------------------------------------------

export function getLangfuseBaseUrl(): string {
  return (baseUrl ?? "").replace(/\/$/, "");
}

export function isLangfuseEnabled(): boolean {
  return Boolean(publicKey && baseUrl);
}

export function getLangfuseClient(): Langfuse | null {
  if (!isLangfuseEnabled()) return null;
  if (!langfuseInstance) {
    try {
      langfuseInstance = new Langfuse({
        publicKey,
        secretKey,
        baseUrl,
        flushAt: 1, // Flush telemetry fast for real-time responsiveness
      });
    } catch (err) {
      warnLangfuseFailure("initialization", err);
      langfuseInstance = null;
    }
  }
  return langfuseInstance;
}

// ---------------------------------------------------------------------------
// Trace helpers
// ---------------------------------------------------------------------------

export interface StartTraceOptions {
  conversationId: string;
  name?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export function startTrace({
  conversationId,
  name = "Agent Conversation Turn",
  userId,
  metadata,
}: StartTraceOptions) {
  const client = getLangfuseClient();
  if (!client) return null;

  try {
    const trace = client.trace({
      id: `${conversationId}-${Date.now()}`,
      sessionId: conversationId,
      name,
      userId,
      metadata: {
        ...metadata,
        client: "Starship Agent Canvas",
      },
    });
    return trace;
  } catch (err) {
    warnLangfuseFailure("startTrace", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Native OTLP Ingestion for Langfuse v4
// Bypasses legacy /api/public/ingestion which is restricted in events_only mode.
// ---------------------------------------------------------------------------

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

interface OtlpAttribute {
  key: string;
  value: Record<string, unknown>;
}

async function sendOtlpSpans(
  traceId: string,
  spans: Array<{
    spanId: string;
    parentSpanId?: string;
    name: string;
    startTimeNs: number;
    endTimeNs: number;
    attributes: OtlpAttribute[];
  }>,
): Promise<boolean> {
  const host = getLangfuseBaseUrl();
  if (!host || !publicKey) return false;

  const authVal = secretKey ? `${publicKey}:${secretKey}` : `${publicKey}:`;
  const basicAuth = btoa(authVal);

  const body = {
    resourceSpans: [
      {
        resource: {
          attributes: [
            {
              key: "service.name",
              value: { stringValue: "starship-agent-canvas" },
            },
            {
              key: "deployment.environment.name",
              value: { stringValue: "production" },
            },
          ],
        },
        scopeSpans: [
          {
            scope: { name: "starship.observability", version: "1.0.0" },
            spans: spans.map((s) => ({
              traceId,
              spanId: s.spanId,
              parentSpanId: s.parentSpanId,
              name: s.name,
              kind: 1,
              flags: 1,
              startTimeUnixNano: String(s.startTimeNs),
              endTimeUnixNano: String(s.endTimeNs),
              attributes: s.attributes,
              status: { code: 1 },
            })),
          },
        ],
      },
    ],
  };

  try {
    // eslint-disable-next-line local/no-direct-agent-server-fetch
    const res = await fetch(`${host}/api/public/otel/v1/traces`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/json",
        "x-langfuse-ingestion-version": "4",
      },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch (err) {
    warnLangfuseFailure("sendOtlpSpans", err);
    return false;
  }
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
  accumulatedCost: number;
  promptTokens: number;
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
 * Dispatches natively via Langfuse v4 OTLP ingest so full input and output
 * are captured reliably without legacy SDK rejection.
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
  const spanId = generateSpanId();

  const nowMs = Date.now();
  const lastLatency = responseLatencies?.length
    ? responseLatencies[responseLatencies.length - 1]
    : null;
  const durationMs = lastLatency ? lastLatency.latency * 1000 : 1000;
  const startMs = nowMs - durationMs;

  const startNs = BigInt(Math.floor(startMs)) * BigInt(1_000_000);
  const endNs = BigInt(Math.floor(nowMs)) * BigInt(1_000_000);

  const attributes: OtlpAttribute[] = [
    { key: "langfuse.observation.type", value: { stringValue: "generation" } },
    {
      key: "langfuse.observation.model.name",
      value: { stringValue: modelName },
    },
    { key: "langfuse.session.id", value: { stringValue: conversationId } },
  ];

  if (input !== undefined && input !== null) {
    const inputStr = typeof input === "string" ? input : JSON.stringify(input);
    attributes.push({
      key: "langfuse.observation.input",
      value: { stringValue: inputStr },
    });
  }

  if (output !== undefined && output !== null) {
    const outputStr =
      typeof output === "string" ? output : JSON.stringify(output);
    attributes.push({
      key: "langfuse.observation.output",
      value: { stringValue: outputStr },
    });
  }

  if (usageAvailable !== false) {
    attributes.push({
      key: "gen_ai.usage.input_tokens",
      value: { intValue: String(promptTokens) },
    });
    attributes.push({
      key: "gen_ai.usage.output_tokens",
      value: { intValue: String(completionTokens) },
    });
    attributes.push({
      key: "gen_ai.usage.total_tokens",
      value: { intValue: String(promptTokens + completionTokens) },
    });
  }

  if (costAvailable !== false && accumulatedCost > 0) {
    attributes.push({
      key: "langfuse.observation.calculatedTotalCost",
      value: { doubleValue: accumulatedCost },
    });
  }

  if (cacheReadTokens) {
    attributes.push({
      key: "langfuse.observation.metadata.cacheReadTokens",
      value: { intValue: String(cacheReadTokens) },
    });
  }

  if (cacheWriteTokens) {
    attributes.push({
      key: "langfuse.observation.metadata.cacheWriteTokens",
      value: { intValue: String(cacheWriteTokens) },
    });
  }

  if (reasoningTokens) {
    attributes.push({
      key: "langfuse.observation.metadata.reasoningTokens",
      value: { intValue: String(reasoningTokens) },
    });
  }

  if (executionProvider) {
    attributes.push({
      key: "langfuse.observation.metadata.executionProvider",
      value: { stringValue: executionProvider },
    });
  }

  if (generationId) {
    attributes.push({
      key: "langfuse.observation.metadata.generationId",
      value: { stringValue: generationId },
    });
  }

  sendOtlpSpans(traceId, [
    {
      spanId,
      name: "LLM Generation",
      startTimeNs: Number(startNs),
      endTimeNs: Number(endNs),
      attributes,
    },
  ]).catch((err) => {
    warnLangfuseFailure("sendOtlpSpans (recordStatsGeneration)", err);
  });

  // Legacy client fallback (if dual write is enabled on server)
  try {
    const client = getLangfuseClient();
    if (client) {
      const legacyTrace = client.trace({
        id: `${conversationId}-stats-${generationId || Date.now()}`,
        sessionId: conversationId,
        name: "Agent Stats Update",
      });
      legacyTrace.generation({
        name: "LLM Generation",
        model: modelName,
        input: input ? [{ role: "user", content: input }] : undefined,
        output: output ? [{ role: "assistant", content: output }] : undefined,
        usage:
          usageAvailable === false
            ? undefined
            : {
                promptTokens,
                completionTokens,
                totalTokens: promptTokens + completionTokens,
              },
      });
      client.flushAsync().catch(() => {});
    }
  } catch {
    // Non-fatal legacy attempt
  }
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
  const spanId = generateSpanId();

  const nowMs = Date.now();
  const dur = Math.max(0, durationMs);
  const startMs = nowMs - dur;

  const startNs = BigInt(Math.floor(startMs)) * BigInt(1_000_000);
  const endNs = BigInt(Math.floor(nowMs)) * BigInt(1_000_000);

  const attributes: OtlpAttribute[] = [
    { key: "langfuse.observation.type", value: { stringValue: "tool" } },
    { key: "langfuse.session.id", value: { stringValue: conversationId } },
    {
      key: "langfuse.observation.metadata.serverName",
      value: { stringValue: serverName },
    },
    {
      key: "langfuse.observation.metadata.status",
      value: { stringValue: status },
    },
  ];

  if (input !== undefined && input !== null) {
    const inputStr = typeof input === "string" ? input : JSON.stringify(input);
    attributes.push({
      key: "langfuse.observation.input",
      value: { stringValue: inputStr },
    });
  }

  if (output !== undefined && output !== null) {
    const outputPayload =
      status === "ERROR" ? { error: errorMessage, output } : output;
    const outputStr =
      typeof outputPayload === "string"
        ? outputPayload
        : JSON.stringify(outputPayload);
    attributes.push({
      key: "langfuse.observation.output",
      value: { stringValue: outputStr },
    });
  }

  if (errorMessage) {
    attributes.push({
      key: "langfuse.observation.level",
      value: { stringValue: "ERROR" },
    });
    attributes.push({
      key: "langfuse.observation.statusMessage",
      value: { stringValue: errorMessage },
    });
  }

  sendOtlpSpans(tid, [
    {
      spanId,
      name: `MCP Tool: ${toolName}`,
      startTimeNs: Number(startNs),
      endTimeNs: Number(endNs),
      attributes,
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

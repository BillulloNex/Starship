import { Langfuse } from "langfuse";
import { displayWarningToast } from "#/utils/custom-toast-handlers";

// Keys come only from build-time env (Coolify build variables) so no secrets
// live in this repo. When unset, browser-side tracing disables itself; the
// server-side OTEL path (docker/entrypoint.sh) still traces all models.
const publicKey = import.meta.env.VITE_LANGFUSE_PUBLIC_KEY as
  | string
  | undefined;
const secretKey = import.meta.env.VITE_LANGFUSE_SECRET_KEY as
  | string
  | undefined;
const baseUrl = import.meta.env.VITE_LANGFUSE_BASE_URL as string | undefined;

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
        client: "GrokBot Agent Canvas",
      },
    });
    return trace;
  } catch (err) {
    warnLangfuseFailure("startTrace", err);
    return null;
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
  startTime,
  endTime = new Date(),
}: RecordGenerationOptions) {
  const client = getLangfuseClient();
  if (!client) return;

  try {
    const trace = traceId
      ? client.trace({ id: traceId })
      : client.trace({
          id: `${conversationId}-${Date.now()}`,
          sessionId: conversationId,
          name: "LLM Generation",
        });

    trace.generation({
      name: "Agent Step Generation",
      model,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
      metadata: {
        cost,
      },
      input,
      output,
      startTime: startTime ?? new Date(Date.now() - 1000),
      endTime,
    });

    client.flushAsync().catch((flushErr) => {
      warnLangfuseFailure("flush (recordGeneration)", flushErr);
    });
  } catch (err) {
    warnLangfuseFailure("recordGeneration", err);
  }
}

// ---------------------------------------------------------------------------
// Stats-based generation recording — wired into the WebSocket event handler
// ---------------------------------------------------------------------------

export interface RecordStatsGenerationOptions {
  conversationId: string;
  modelName: string;
  accumulatedCost: number;
  promptTokens: number;
  completionTokens: number;
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
 * This is the *live* path that the WebSocket handler should call
 * whenever a stats event arrives with token usage data.
 */
export function recordStatsGeneration({
  conversationId,
  modelName,
  accumulatedCost,
  promptTokens,
  completionTokens,
  cacheReadTokens,
  cacheWriteTokens,
  reasoningTokens,
  responseLatencies,
  input,
  output,
}: RecordStatsGenerationOptions) {
  const client = getLangfuseClient();
  if (!client) return;

  try {
    const traceId = `${conversationId}-stats-${Date.now()}`;
    const trace = client.trace({
      id: traceId,
      sessionId: conversationId,
      name: "Agent Stats Update",
      metadata: {
        client: "GrokBot Agent Canvas",
        source: "websocket_stats_event",
      },
    });

    // Compute latency from the most recent response if available
    const lastLatency = responseLatencies?.length
      ? responseLatencies[responseLatencies.length - 1]
      : null;

    const endTime = new Date();
    const startTime = lastLatency
      ? new Date(endTime.getTime() - lastLatency.latency * 1000)
      : new Date(endTime.getTime() - 1000);

    trace.generation({
      name: "LLM Generation",
      model: modelName,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
      metadata: {
        accumulatedCost,
        cacheReadTokens,
        cacheWriteTokens,
        reasoningTokens,
        responseId: lastLatency?.response_id,
        latencySeconds: lastLatency?.latency,
      },
      input: input ? [{ role: "user", content: input }] : undefined,
      output: output ? [{ role: "assistant", content: output }] : undefined,
      startTime,
      endTime,
    });

    client.flushAsync().catch((flushErr) => {
      warnLangfuseFailure("flush (recordStatsGeneration)", flushErr);
    });
  } catch (err) {
    warnLangfuseFailure("recordStatsGeneration", err);
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
  const client = getLangfuseClient();
  if (!client) return;

  try {
    const trace = traceId
      ? client.trace({ id: traceId })
      : client.trace({
          id: `${conversationId}-${Date.now()}`,
          sessionId: conversationId,
          name: "MCP Tool Execution",
        });

    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - Math.max(0, durationMs));

    trace.span({
      name: `MCP Tool: ${toolName}`,
      metadata: {
        serverName,
        durationMs,
      },
      input,
      output: status === "ERROR" ? { error: errorMessage, output } : output,
      statusMessage: errorMessage,
      level: status === "ERROR" ? "ERROR" : "DEFAULT",
      startTime,
      endTime,
    });

    client.flushAsync().catch((flushErr) => {
      warnLangfuseFailure("flush (recordMcpToolCall)", flushErr);
    });
  } catch (err) {
    warnLangfuseFailure("recordMcpToolCall", err);
  }
}

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

export function getLangfuseSessionUrl(conversationId: string): string {
  const base = getLangfuseBaseUrl();
  return `${base}/sessions/${conversationId}`;
}

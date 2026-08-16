/**
 * Unified observability fanout layer.
 *
 * All LLM generation and MCP tool-call events flow through this module.
 * It dispatches to every registered ObservabilityBackend (Langfuse,
 * PostHog AI, Comet Opik, Langwatch, etc.) in parallel. Backends that
 * fail are logged and do not block others.
 *
 * Adding a new backend = implement the interface + register it here.
 */

// ---------------------------------------------------------------------------
// Shared data types — the canonical shapes for generation & tool events
// ---------------------------------------------------------------------------

export interface GenerationData {
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
}

export interface ToolCallData {
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

// ---------------------------------------------------------------------------
// Backend interface
// ---------------------------------------------------------------------------

export interface ObservabilityBackend {
  /** Short human-readable name used in log messages. */
  readonly name: string;
  /** If false the backend is skipped during dispatch. */
  readonly enabled: boolean;
  /** Record an LLM generation event. */
  recordGeneration(data: GenerationData): void;
  /** Record an MCP tool call event. */
  recordToolCall(data: ToolCallData): void;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const backends: ObservabilityBackend[] = [];

export function registerBackend(backend: ObservabilityBackend): void {
  backends.push(backend);
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export function fanoutGeneration(data: GenerationData): void {
  void ensureBackends().then(() => {
    for (const backend of backends) {
      if (!backend.enabled) continue;
      try {
        backend.recordGeneration(data);
      } catch (err) {
        console.warn(
          `[observability:${backend.name}] recordGeneration error:`,
          err,
        );
      }
    }
  });
}

export function fanoutToolCall(data: ToolCallData): void {
  void ensureBackends().then(() => {
    for (const backend of backends) {
      if (!backend.enabled) continue;
      try {
        backend.recordToolCall(data);
      } catch (err) {
        console.warn(
          `[observability:${backend.name}] recordToolCall error:`,
          err,
        );
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Lazy backend initialization — loaded on first event, never blocks render
// ---------------------------------------------------------------------------

let backendsLoaded = false;

async function ensureBackends(): Promise<void> {
  if (backendsLoaded) return;
  backendsLoaded = true;

  try {
    await Promise.allSettled([
      import("./backends/langfuse-backend"),
      import("./backends/posthog-ai-backend"),
      import("./backends/opik-backend"),
      import("./backends/langwatch-backend"),
    ]);
  } catch (e) {
    console.warn("[observability] Failed to load some backends:", e);
  }
}

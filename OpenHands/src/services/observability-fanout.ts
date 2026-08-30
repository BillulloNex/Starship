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
  /** Stable provider response id used to deduplicate repeated stats updates. */
  generationId?: string;
  modelName: string;
  /**
   * Agent/runtime that executed the generation (for example `cursor`). This is
   * intentionally separate from the underlying model vendor inferred from
   * `modelName` (for example `xai` for a Cursor-selected Grok model).
   */
  executionProvider?: string;
  accumulatedCost: number;
  promptTokens: number;
  completionTokens: number;
  /** False when the provider completed the turn without reporting usage. */
  usageAvailable?: boolean;
  /** False when the provider completed the turn without reporting cost. */
  costAvailable?: boolean;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
  responseLatencies?: Array<{
    model: string;
    latency: number;
    response_id: string;
  }>;
  /** The user prompt / input messages sent to the LLM. */
  input?: string;
  /** The assistant response / output from the LLM. */
  output?: string;
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

function getBackends(): ObservabilityBackend[] {
  const g = globalThis as unknown as {
    __OH_OBSERVABILITY_BACKENDS__?: ObservabilityBackend[];
  };
  if (!g.__OH_OBSERVABILITY_BACKENDS__) {
    g.__OH_OBSERVABILITY_BACKENDS__ = [];
  }
  return g.__OH_OBSERVABILITY_BACKENDS__;
}

export function registerBackend(backend: ObservabilityBackend): void {
  getBackends().push(backend);
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export function fanoutGeneration(data: GenerationData): void {
  const list = getBackends();
  for (const backend of list) {
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
}

export function fanoutToolCall(data: ToolCallData): void {
  const list = getBackends();
  for (const backend of list) {
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
}

// ---------------------------------------------------------------------------
// Backend initialization — backends are registered eagerly at module load.
// Their `enabled` checks read from window.__OBSERVABILITY_CONFIG__ at
// runtime, so they work even when build-time env vars are empty.
//
// We use a console.log side effect to prevent Vite from tree-shaking
// the imports. This is intentional — observability must always load.
// ---------------------------------------------------------------------------

// Side-effect imports: each module calls registerBackend() at load time.
import "./backends/langfuse-backend";
import "./backends/posthog-ai-backend";
import "./backends/opik-backend";
import "./backends/langwatch-backend";
import "./backends/raindrop-backend";

// Force Vite to treat this module as having side effects by logging

// at module evaluation time. This prevents tree-shaking.
console.debug(
  `[observability] ${getBackends().length} backends registered:`,
  getBackends()
    .map((b) => `${b.name}(${b.enabled ? "on" : "off"})`)
    .join(", ") || "none",
);

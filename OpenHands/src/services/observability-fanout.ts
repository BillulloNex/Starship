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

import {
  OPIK_API_KEY,
  OPIK_BASE_URL,
  OPIK_WORKSPACE,
  LANGWATCH_API_KEY,
  LANGWATCH_BASE_URL,
  POSTHOG_AI_ENABLED,
} from "./backends/observability-config";

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

let backends: ObservabilityBackend[] | undefined;

export function registerBackend(backend: ObservabilityBackend): void {
  if (!backends) backends = [];
  backends.push(backend);
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export function fanoutGeneration(data: GenerationData): void {
  if (!backends) return;
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
}

export function fanoutToolCall(data: ToolCallData): void {
  if (!backends) return;
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

// Force Vite to treat this module as having side effects by logging
// at module evaluation time. This prevents tree-shaking.
console.debug(
  `[observability] ${backends?.length ?? 0} backends registered:`,
  backends?.map((b) => `${b.name}(${b.enabled ? "on" : "off"})`).join(", ") ?? "none",
);

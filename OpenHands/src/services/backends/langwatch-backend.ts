import {
  GenerationData,
  ToolCallData,
  ObservabilityBackend,
  registerBackend,
} from "../observability-fanout";
import { LANGWATCH_API_KEY, LANGWATCH_BASE_URL } from "./observability-config";

function getProviderFromModel(modelName: string): string {
  const lower = modelName.toLowerCase();
  if (lower.includes("claude")) return "anthropic";
  if (lower.includes("gpt")) return "openai";
  if (lower.includes("grok")) return "xai";
  if (lower.includes("gemini")) return "google";
  return "unknown";
}

/**
 * Observability backend adapter for Langwatch.
 * Sends traces and spans via REST collector API using fetch with simple batching.
 *
 * `enabled` is a getter evaluated at runtime (not build time) so Vite
 * cannot tree-shake this module when the API key comes from runtime
 * config injection (window.__OBSERVABILITY_CONFIG__).
 */
class LangwatchBackend implements ObservabilityBackend {
  readonly name = "Langwatch";

  get enabled(): boolean {
    return !!LANGWATCH_API_KEY;
  }

  private get apiKey() {
    return LANGWATCH_API_KEY;
  }
  private get endpoint() {
    return LANGWATCH_BASE_URL;
  }

  // Mapping conversationId to their collected spans
  private tracesBatch: Record<string, unknown[]> = {};
  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  private flush() {
    const payloads = Object.entries(this.tracesBatch).map(
      ([traceId, spans]) => ({
        trace_id: traceId,
        spans,
      }),
    );

    this.tracesBatch = {};
    this.timeoutId = null;

    const url = `${this.endpoint}/api/collector`;
    const headers = {
      "Content-Type": "application/json",
      "X-Auth-Token": this.apiKey,
    };

    payloads.forEach((payload) => {
      fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      }).catch((e) => console.warn(`Langwatch API request failed:`, e));
    });
  }

  private enqueueSpan(traceId: string, span: unknown) {
    if (!this.tracesBatch[traceId]) {
      this.tracesBatch[traceId] = [];
    }
    this.tracesBatch[traceId].push(span);

    if (!this.timeoutId) {
      this.timeoutId = setTimeout(() => this.flush(), 500);
    }
  }

  recordGeneration(data: GenerationData): void {
    if (!this.enabled) return;

    const spanId = crypto.randomUUID();
    const endMs = Date.now();
    const startMs = endMs; // simple approximation

    this.enqueueSpan(data.conversationId, {
      type: "llm",
      span_id: spanId,
      vendor: getProviderFromModel(data.modelName),
      model: data.modelName,
      input: { type: "text", value: data.input || "Agent generation" },
      output: { type: "text", value: data.output || "Generation completed" },
      metrics: {
        prompt_tokens: data.promptTokens,
        completion_tokens: data.completionTokens,
        tokens_estimated: false,
        cost: data.accumulatedCost,
      },
      timestamps: {
        started_at: startMs,
        finished_at: endMs,
      },
    });
  }

  recordToolCall(data: ToolCallData): void {
    if (!this.enabled) return;

    const spanId = crypto.randomUUID();
    const endMs = Date.now();
    const startMs = endMs - data.durationMs;

    this.enqueueSpan(data.conversationId, {
      type: "tool",
      span_id: spanId,
      name: data.toolName,
      metadata: {
        server_name: data.serverName,
        duration_ms: data.durationMs,
        status: data.status,
        error_message: data.errorMessage,
      },
      timestamps: {
        started_at: startMs,
        finished_at: endMs,
      },
    });
  }
}

registerBackend(new LangwatchBackend());

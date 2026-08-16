import {
  GenerationData,
  ToolCallData,
  ObservabilityBackend,
  registerBackend,
} from "../observability-fanout";
import { OPIK_API_KEY, OPIK_BASE_URL, OPIK_WORKSPACE } from "./observability-config";

/**
 * Observability backend adapter for Comet Opik.
 * Sends traces and spans via REST API using fetch with simple batching.
 *
 * `enabled` is a getter evaluated at runtime (not build time) so Vite
 * cannot tree-shake this module when the API key comes from runtime
 * config injection (window.__OBSERVABILITY_CONFIG__).
 */
class OpikBackend implements ObservabilityBackend {
  readonly name = "Opik";

  get enabled(): boolean {
    return !!OPIK_API_KEY;
  }

  private get apiKey() {
    return OPIK_API_KEY;
  }
  private get baseUrl() {
    return OPIK_BASE_URL;
  }
  private get workspace() {
    return OPIK_WORKSPACE;
  }

  private tracesBatch: Record<string, unknown>[] = [];
  private spansBatch: Record<string, unknown>[] = [];
  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  private flush() {
    if (this.tracesBatch.length > 0) {
      const body = { traces: this.tracesBatch };
      this.tracesBatch = [];
      this.sendRequest(`${this.baseUrl}/v1/private/traces`, body);
    }

    if (this.spansBatch.length > 0) {
      const body = { spans: this.spansBatch };
      this.spansBatch = [];
      this.sendRequest(`${this.baseUrl}/v1/private/spans`, body);
    }

    this.timeoutId = null;
  }

  private sendRequest(url: string, body: Record<string, unknown>) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Comet-Api-Key": this.apiKey,
    };
    if (this.workspace) {
      headers["Comet-Workspace"] = this.workspace;
    }

    fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }).catch((e) => console.warn(`Opik API request failed:`, e));
  }

  private enqueueTrace(trace: Record<string, unknown>) {
    this.tracesBatch.push(trace);
    this.scheduleFlush();
  }

  private enqueueSpan(span: Record<string, unknown>) {
    this.spansBatch.push(span);
    this.scheduleFlush();
  }

  private scheduleFlush() {
    if (!this.timeoutId) {
      this.timeoutId = setTimeout(() => this.flush(), 500);
    }
  }

  recordGeneration(data: GenerationData): void {
    if (!this.enabled) return;

    const traceId = crypto.randomUUID();
    const spanId = crypto.randomUUID();
    const now = new Date().toISOString();

    this.enqueueTrace({
      id: traceId,
      name: `Conversation: ${data.conversationId}`,
      project_name: "grokbot",
      start_time: now,
      end_time: now,
      input: data.input
        ? { prompt: data.input, conversationId: data.conversationId }
        : { conversationId: data.conversationId },
      output: data.output ? { response: data.output } : {},
      metadata: { cost: data.accumulatedCost },
      tags: [],
    });

    this.enqueueSpan({
      id: spanId,
      trace_id: traceId,
      name: "LLM Generation",
      type: "llm",
      start_time: now,
      end_time: now,
      model: data.modelName,
      usage: {
        prompt_tokens: data.promptTokens,
        completion_tokens: data.completionTokens,
        total_tokens: data.promptTokens + data.completionTokens,
      },
      metadata: {
        cache_read_tokens: data.cacheReadTokens,
        cache_write_tokens: data.cacheWriteTokens,
        reasoning_tokens: data.reasoningTokens,
      },
    });
  }

  recordToolCall(data: ToolCallData): void {
    if (!this.enabled) return;

    const spanId = crypto.randomUUID();
    const traceId = data.traceId || crypto.randomUUID();
    const now = new Date().toISOString();

    this.enqueueSpan({
      id: spanId,
      trace_id: traceId,
      name: data.toolName,
      type: "tool",
      start_time: now,
      end_time: now,
      metadata: {
        server_name: data.serverName,
        duration_ms: data.durationMs,
        status: data.status,
        error_message: data.errorMessage,
        conversation_id: data.conversationId,
      },
    });
  }
}

registerBackend(new OpikBackend());

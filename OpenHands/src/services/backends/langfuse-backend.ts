/**
 * Langfuse backend adapter for the observability fanout layer.
 *
 * Wraps the existing langfuse-service.ts functions as an ObservabilityBackend.
 * No logic changes — just interface conformance so the fanout dispatcher can
 * treat Langfuse identically to PostHog AI, Opik, and Langwatch.
 */

import {
  isLangfuseEnabled,
  recordStatsGeneration,
  recordMcpToolCall,
} from "../langfuse-service";
import {
  registerBackend,
  type ObservabilityBackend,
  type GenerationData,
  type ToolCallData,
} from "../observability-fanout";

class LangfuseBackend implements ObservabilityBackend {
  readonly name = "langfuse";

  get enabled(): boolean {
    return isLangfuseEnabled();
  }

  recordGeneration(data: GenerationData): void {
    recordStatsGeneration({
      conversationId: data.conversationId,
      modelName: data.modelName,
      accumulatedCost: data.accumulatedCost,
      promptTokens: data.promptTokens,
      completionTokens: data.completionTokens,
      cacheReadTokens: data.cacheReadTokens,
      cacheWriteTokens: data.cacheWriteTokens,
      reasoningTokens: data.reasoningTokens,
      responseLatencies: data.responseLatencies,
    });
  }

  recordToolCall(data: ToolCallData): void {
    recordMcpToolCall({
      traceId: data.traceId,
      conversationId: data.conversationId,
      toolName: data.toolName,
      serverName: data.serverName,
      input: data.input,
      output: data.output,
      durationMs: data.durationMs,
      status: data.status,
      errorMessage: data.errorMessage,
    });
  }
}

registerBackend(new LangfuseBackend());

import {
  GenerationData,
  ToolCallData,
  ObservabilityBackend,
  registerBackend,
} from "../observability-fanout";
import { POSTHOG_AI_ENABLED } from "./observability-config";
import {
  isTelemetryEnabled,
  initializePostHogClient,
} from "#/services/telemetry";

function getProviderFromModel(modelName: string): string {
  const lower = modelName.toLowerCase();
  if (lower.includes("claude")) return "anthropic";
  if (lower.includes("gpt")) return "openai";
  if (lower.includes("grok")) return "xai";
  if (lower.includes("gemini")) return "google";
  return "unknown";
}

/**
 * Observability backend adapter for PostHog AI.
 * Captures events via the shared PostHog client when telemetry is enabled.
 */
class PostHogAIBackend implements ObservabilityBackend {
  readonly name = "PostHogAI";
  readonly enabled = POSTHOG_AI_ENABLED;

  private async capture(
    eventName: string,
    properties: Record<string, unknown>,
  ) {
    if (!this.enabled || !isTelemetryEnabled()) return;

    try {
      const posthog = await initializePostHogClient();
      if (posthog) {
        posthog.capture(eventName, properties);
      }
    } catch (e) {
      console.warn("Failed to capture PostHog AI event", e);
    }
  }

  recordGeneration(data: GenerationData): void {
    if (!this.enabled) return;

    let latencySeconds: number | undefined;
    if (data.responseLatencies && data.responseLatencies.length > 0) {
      const last = data.responseLatencies[data.responseLatencies.length - 1];
      latencySeconds = last.latency; // already in seconds from agent-server
    }

    this.capture("$ai_generation", {
      $ai_model: data.modelName,
      $ai_provider: getProviderFromModel(data.modelName),
      $ai_input_tokens: data.promptTokens,
      $ai_output_tokens: data.completionTokens,
      $ai_total_cost_usd: data.accumulatedCost,
      $ai_latency: latencySeconds,
      $ai_trace_id: data.conversationId,
      cache_read_tokens: data.cacheReadTokens,
      cache_write_tokens: data.cacheWriteTokens,
      reasoning_tokens: data.reasoningTokens,
    });
  }

  recordToolCall(data: ToolCallData): void {
    if (!this.enabled) return;

    this.capture("$ai_tool_call", {
      tool_name: data.toolName,
      server_name: data.serverName,
      duration_ms: data.durationMs,
      status: data.status,
      error_message: data.errorMessage,
      trace_id: data.conversationId,
    });
  }
}

registerBackend(new PostHogAIBackend());

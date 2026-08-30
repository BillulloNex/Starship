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
  if (lower.includes("kimi") || lower.includes("moonshot")) return "moonshot";
  return "unknown";
}

export function buildPostHogGenerationProperties(
  data: GenerationData,
): Record<string, unknown> {
  let latencySeconds: number | undefined;
  if (data.responseLatencies && data.responseLatencies.length > 0) {
    const last = data.responseLatencies[data.responseLatencies.length - 1];
    latencySeconds = last.latency;
  }

  const modelProvider = getProviderFromModel(data.modelName);
  const spanName = data.executionProvider
    ? `${data.executionProvider}_generation`
    : "llm_generation";
  const properties: Record<string, unknown> = {
    $ai_generation_id: data.generationId,
    $ai_span_id: data.generationId,
    $ai_span_name: spanName,
    $ai_model: data.modelName,
    $ai_provider: data.executionProvider || modelProvider,
    $ai_latency: latencySeconds,
    $ai_trace_id: data.conversationId,
    $ai_session_id: data.conversationId,
    $ai_is_error: false,
    $insert_id: data.generationId,
    grokbot_execution_provider: data.executionProvider || modelProvider,
    grokbot_model_provider: modelProvider,
    grokbot_usage_available: data.usageAvailable !== false,
    grokbot_cost_available: data.costAvailable !== false,
  };

  // Cursor's ACP server currently completes turns without emitting ACP usage
  // data. Omit standard token/cost properties in that case so PostHog does
  // not interpret "unknown" as a measured zero.
  if (data.usageAvailable !== false) {
    properties.$ai_input_tokens = data.promptTokens;
    properties.$ai_output_tokens = data.completionTokens;
    properties.cache_read_tokens = data.cacheReadTokens;
    properties.cache_write_tokens = data.cacheWriteTokens;
    properties.reasoning_tokens = data.reasoningTokens;
  }
  if (data.costAvailable !== false) {
    properties.$ai_total_cost_usd = data.accumulatedCost;
  }

  if (data.input) {
    properties.$ai_input = [{ role: "user", content: data.input }];
  }
  if (data.output) {
    properties.$ai_output_choices = [
      { role: "assistant", content: data.output },
    ];
    properties.$ai_output = data.output;
  }

  return properties;
}

/**
 * Observability backend adapter for PostHog AI.
 * Captures events via the shared PostHog client when telemetry is enabled.
 *
 * `enabled` is a getter evaluated at runtime (not build time) so Vite
 * cannot tree-shake this module.
 */
class PostHogAIBackend implements ObservabilityBackend {
  readonly name = "PostHogAI";

  get enabled(): boolean {
    return POSTHOG_AI_ENABLED;
  }

  private async capture(
    eventName: string,
    properties: Record<string, unknown>,
  ) {
    console.debug(
      "[PostHogAI] capture called:",
      eventName,
      "enabled:",
      this.enabled,
      "telemetryEnabled:",
      isTelemetryEnabled(),
    );
    if (!this.enabled || !isTelemetryEnabled()) return;

    try {
      const apiKey =
        (typeof window !== "undefined" &&
          window.__OBSERVABILITY_CONFIG__?.["VITE_POSTHOG_API_KEY"]) ||
        (typeof window !== "undefined" &&
          window.__OBSERVABILITY_CONFIG__?.["POSTHOG_API_KEY"]) ||
        (import.meta.env.VITE_POSTHOG_API_KEY as string | undefined) ||
        "phc_uAcMi6kFo9gVGsUTtTxSRHQuspXojDphT9ZkcsbhSQt9";

      const apiHost =
        (typeof window !== "undefined" &&
          window.__OBSERVABILITY_CONFIG__?.["VITE_POSTHOG_HOST"]) ||
        (typeof window !== "undefined" &&
          window.__OBSERVABILITY_CONFIG__?.["POSTHOG_HOST"]) ||
        (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ||
        "https://us.i.posthog.com";

      // Prefer the shared PostHog client so batching, consent, and retries stay
      // on one delivery path. Sending the same event through both the client
      // and /capture creates duplicate AI generations.
      const posthog = await initializePostHogClient(true);
      if (posthog) {
        posthog.opt_in_capturing();
        console.debug("[PostHogAI] calling posthog.capture:", eventName);
        posthog.capture(eventName, properties, { send_instantly: true });
        if (
          typeof (posthog as unknown as { flush?: () => void }).flush ===
          "function"
        ) {
          (posthog as unknown as { flush: () => void }).flush();
        }
        return;
      }

      // Fall back to the capture API only when the JS client could not be
      // initialized. This keeps telemetry working without double-sending.
      if (apiKey) {
        fetch(`${apiHost.replace(/\/$/, "")}/capture/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: apiKey,
            event: eventName,
            distinct_id: properties.$ai_trace_id || "grokbot-user",
            properties,
            timestamp: new Date().toISOString(),
          }),
        }).catch((err) => {
          console.warn("[PostHogAI] direct capture fetch failed:", err);
        });
      }
    } catch (e) {
      console.warn("Failed to capture PostHog AI event", e);
    }
  }

  recordGeneration(data: GenerationData): void {
    if (!this.enabled) return;

    // Skip generations without input or output to avoid creating empty
    // trace nodes in PostHog AI.
    if (!data.input && !data.output) return;

    const properties = buildPostHogGenerationProperties(data);

    this.capture("$ai_generation", properties);
  }

  recordToolCall(data: ToolCallData): void {
    if (!this.enabled) return;

    this.capture("$ai_span", {
      $ai_trace_id: data.conversationId,
      $ai_session_id: data.conversationId,
      $ai_span_name: data.toolName,
      $ai_span_id: `${data.conversationId}:${data.toolName}:${data.status ?? "done"}`,
      $ai_input_state: data.input,
      $ai_output_state: data.output,
      $ai_latency: data.durationMs / 1000,
      $ai_is_error: data.status === "ERROR",
      $ai_error: data.errorMessage,
      tool_name: data.toolName,
      server_name: data.serverName,
      duration_ms: data.durationMs,
      status: data.status,
      error_message: data.errorMessage,
    });
  }
}

registerBackend(new PostHogAIBackend());

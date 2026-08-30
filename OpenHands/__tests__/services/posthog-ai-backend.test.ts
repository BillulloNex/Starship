import { describe, expect, it } from "vitest";
import { buildPostHogGenerationProperties } from "#/services/backends/posthog-ai-backend";

describe("buildPostHogGenerationProperties", () => {
  it("attributes Cursor execution explicitly and omits unavailable usage", () => {
    const properties = buildPostHogGenerationProperties({
      conversationId: "conv-cursor",
      generationId: "cursor-response-1",
      modelName: "grok-4.6[effort=high,fast=true]",
      executionProvider: "cursor",
      accumulatedCost: 0,
      promptTokens: 0,
      completionTokens: 0,
      usageAvailable: false,
      costAvailable: false,
      responseLatencies: [
        {
          model: "grok-4.6[effort=high,fast=true]",
          latency: 23.5,
          response_id: "cursor-response-1",
        },
      ],
      input: "User message",
      output: "Assistant reply",
    });

    expect(properties).toMatchObject({
      $ai_generation_id: "cursor-response-1",
      $ai_model: "grok-4.6[effort=high,fast=true]",
      $ai_provider: "cursor",
      $ai_latency: 23.5,
      $ai_trace_id: "conv-cursor",
      grokbot_execution_provider: "cursor",
      grokbot_model_provider: "xai",
      grokbot_usage_available: false,
      grokbot_cost_available: false,
      $ai_output: "Assistant reply",
    });
    expect(properties).not.toHaveProperty("$ai_input_tokens");
    expect(properties).not.toHaveProperty("$ai_output_tokens");
    expect(properties).not.toHaveProperty("$ai_total_cost_usd");
  });

  it("preserves reported token and cost properties for direct generations", () => {
    const properties = buildPostHogGenerationProperties({
      conversationId: "conv-direct",
      modelName: "gpt-5.6-luna",
      accumulatedCost: 0.42,
      promptTokens: 120,
      completionTokens: 30,
    });

    expect(properties).toMatchObject({
      $ai_provider: "openai",
      $ai_input_tokens: 120,
      $ai_output_tokens: 30,
      $ai_total_cost_usd: 0.42,
      grokbot_usage_available: true,
      grokbot_cost_available: true,
    });
  });
});

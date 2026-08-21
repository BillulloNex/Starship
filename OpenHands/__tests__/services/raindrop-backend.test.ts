import { describe, it, expect, vi, beforeEach } from "vitest";
import { Raindrop } from "@raindrop-ai/browser-sdk";
import { RaindropBackend } from "#/services/backends/raindrop-backend";

const mockTrackAi = vi.fn().mockResolvedValue({ eventIds: ["evt_123"] });

vi.mock("@raindrop-ai/browser-sdk", () => {
  return {
    Raindrop: vi.fn().mockImplementation(function (this: any) {
      this.trackAi = mockTrackAi;
    }),
  };
});


describe("RaindropBackend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("has the name Raindrop", () => {
    const backend = new RaindropBackend();
    expect(backend.name).toBe("Raindrop");
  });

  it("is enabled when RAINDROP_WRITE_KEY is present", () => {
    const backend = new RaindropBackend();
    expect(backend.enabled).toBe(true);
  });

  it("records generation events properly", () => {
    const backend = new RaindropBackend();
    backend.recordGeneration({
      conversationId: "test-convo-123",
      modelName: "grok-beta",
      accumulatedCost: 0.05,
      promptTokens: 120,
      completionTokens: 80,
      input: "Hello world prompt",
      output: "Hello assistant response",
    });

    expect(mockTrackAi).toHaveBeenCalledTimes(1);
    const callArg = mockTrackAi.mock.calls[0][0];
    expect(callArg.event).toBe("chat_message");
    expect(callArg.model).toBe("grok-beta");
    expect(callArg.input).toBe("Hello world prompt");
    expect(callArg.output).toBe("Hello assistant response");
    expect(callArg.convoId).toBe("test-convo-123");
    expect(callArg.properties.cost).toBe(0.05);
    expect(callArg.properties.promptTokens).toBe(120);
    expect(callArg.properties.completionTokens).toBe(80);
    expect(callArg.properties.totalTokens).toBe(200);
  });

  it("records tool call events properly", () => {
    const backend = new RaindropBackend();
    backend.recordToolCall({
      traceId: "trace-456",
      conversationId: "test-convo-123",
      toolName: "web_search",
      serverName: "browser",
      input: { query: "vitest docs" },
      output: { result: "found" },
      durationMs: 350,
      status: "SUCCESS",
    });

    expect(mockTrackAi).toHaveBeenCalledTimes(1);
    const callArg = mockTrackAi.mock.calls[0][0];
    expect(callArg.event).toBe("tool_call");
    expect(callArg.convoId).toBe("test-convo-123");
    expect(callArg.properties.toolName).toBe("web_search");
    expect(callArg.properties.serverName).toBe("browser");
    expect(callArg.properties.durationMs).toBe(350);
    expect(callArg.properties.status).toBe("SUCCESS");
  });
});

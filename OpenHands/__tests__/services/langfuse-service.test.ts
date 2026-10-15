import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GROKBOT_VERSION } from "#/constants/grokbot-version";

vi.mock("#/services/backends/observability-config", () => ({
  LANGFUSE_PUBLIC_KEY: "pk-lf-test",
  LANGFUSE_BASE_URL: "https://langfuse.example.test",
}));

vi.mock("#/utils/custom-toast-handlers", () => ({
  displayWarningToast: vi.fn(),
}));

const { recordStatsGeneration, recordMcpToolCall, resetLangfuseUsageTotals } =
  await import("#/services/langfuse-service");

type Attr = { key: string; value: Record<string, unknown> };

const fetchMock = vi.fn();

function sentSpans() {
  return fetchMock.mock.calls.map(([url, init]) => {
    expect(url).toBe("/api/observability/langfuse/otel");
    const body = JSON.parse((init as RequestInit).body as string);
    return body.resourceSpans[0].scopeSpans[0].spans[0];
  });
}

function attrs(span: { attributes: Attr[] }) {
  return Object.fromEntries(
    span.attributes.map((a) => [a.key, Object.values(a.value)[0]]),
  );
}

describe("langfuse-service v4 OTLP export", () => {
  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    resetLangfuseUsageTotals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exports a generation with propagated trace context and v4 attribute names", () => {
    recordStatsGeneration({
      conversationId: "conv-1",
      generationId: "resp-1",
      modelName: "claude-sonnet-5-5",
      accumulatedCost: 0.02,
      promptTokens: 100,
      completionTokens: 40,
      cacheReadTokens: 10,
      input: "hi",
      output: { text: "hello" },
    });

    const [span] = sentSpans();
    const a = attrs(span);
    expect(a["langfuse.observation.type"]).toBe("generation");
    expect(a["langfuse.observation.model.name"]).toBe("claude-sonnet-5-5");
    expect(a["langfuse.session.id"]).toBe("conv-1");
    expect(a["langfuse.trace.name"]).toBe("Starship Conversation");
    expect(a["langfuse.release"]).toBe(GROKBOT_VERSION);
    expect(a["langfuse.environment"]).toBeTruthy();
    expect(a["langfuse.observation.input"]).toBe("hi");
    expect(a["langfuse.observation.output"]).toBe('{"text":"hello"}');
    expect(
      JSON.parse(a["langfuse.observation.usage_details"] as string),
    ).toEqual({
      input: 100,
      output: 40,
      total: 140,
      cache_read_input_tokens: 10,
    });
    expect(
      JSON.parse(a["langfuse.observation.cost_details"] as string),
    ).toEqual({
      total: 0.02,
    });
    // Legacy / unmapped keys must be gone
    expect(a).not.toHaveProperty("langfuse.observation.calculatedTotalCost");
    expect(a).not.toHaveProperty("langfuse.trace.input");
    expect(span.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(span.spanId).toMatch(/^[0-9a-f]{16}$/);
    expect(span.status).toEqual({ code: 1 });
  });

  it("emits nanosecond timestamps without float precision loss", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_760_000_000_123);
    recordStatsGeneration({
      conversationId: "conv-ts",
      modelName: "m",
      accumulatedCost: 0,
      promptTokens: 1,
      completionTokens: 1,
      responseLatencies: [{ model: "m", latency: 1.5, response_id: "r" }],
    });
    vi.mocked(Date.now).mockRestore();

    const [span] = sentSpans();
    expect(span.endTimeUnixNano).toBe("1760000000123000000");
    expect(span.startTimeUnixNano).toBe("1759999998623000000");
  });

  it("exports per-turn deltas instead of accumulated totals", () => {
    const base = { conversationId: "conv-2", modelName: "m" };
    recordStatsGeneration({
      ...base,
      accumulatedCost: 0.01,
      promptTokens: 100,
      completionTokens: 10,
    });
    recordStatsGeneration({
      ...base,
      accumulatedCost: 0.03,
      promptTokens: 250,
      completionTokens: 30,
    });

    const [first, second] = sentSpans().map(attrs);
    expect(
      JSON.parse(first["langfuse.observation.usage_details"] as string).total,
    ).toBe(110);
    const usage = JSON.parse(
      second["langfuse.observation.usage_details"] as string,
    );
    expect(usage).toEqual({ input: 150, output: 20, total: 170 });
    expect(
      JSON.parse(second["langfuse.observation.cost_details"] as string).total,
    ).toBeCloseTo(0.02);
  });

  it("tracks deltas independently per model and resets on counter rollback", () => {
    recordStatsGeneration({
      conversationId: "c",
      modelName: "a",
      accumulatedCost: 0,
      promptTokens: 100,
      completionTokens: 0,
    });
    recordStatsGeneration({
      conversationId: "c",
      modelName: "b",
      accumulatedCost: 0,
      promptTokens: 5,
      completionTokens: 0,
    });
    recordStatsGeneration({
      conversationId: "c",
      modelName: "a",
      accumulatedCost: 0,
      promptTokens: 20,
      completionTokens: 0,
    });

    const usages = sentSpans()
      .map(attrs)
      .map(
        (a) =>
          JSON.parse(a["langfuse.observation.usage_details"] as string).input,
      );
    expect(usages).toEqual([100, 5, 20]);
  });

  it("omits usage and cost when the provider did not report them", () => {
    recordStatsGeneration({
      conversationId: "conv-acp",
      modelName: "acp",
      accumulatedCost: 0,
      promptTokens: 0,
      completionTokens: 0,
      usageAvailable: false,
      costAvailable: false,
    });
    const a = attrs(sentSpans()[0]);
    expect(a).not.toHaveProperty("langfuse.observation.usage_details");
    expect(a).not.toHaveProperty("langfuse.observation.cost_details");
  });

  it("exports failed tool calls with ERROR level, status_message, and OTLP error status", () => {
    recordMcpToolCall({
      conversationId: "conv-3",
      toolName: "search",
      serverName: "web",
      input: { q: "x" },
      output: null,
      durationMs: 250,
      status: "ERROR",
      errorMessage: "boom",
    });

    const [span] = sentSpans();
    const a = attrs(span);
    expect(span.name).toBe("MCP Tool: search");
    expect(a["langfuse.observation.type"]).toBe("tool");
    expect(a["langfuse.session.id"]).toBe("conv-3");
    expect(a["langfuse.trace.name"]).toBe("Starship Conversation");
    expect(a["langfuse.observation.level"]).toBe("ERROR");
    expect(a["langfuse.observation.status_message"]).toBe("boom");
    expect(a).not.toHaveProperty("langfuse.observation.statusMessage");
    expect(span.status).toEqual({ code: 2, message: "boom" });
  });
});

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildModelConfigOptions,
  cursorExtensionAutoResult,
  formatCursorModelId,
  isCursorExtensionRequest,
  nativeAgentAcpArgs,
  normalizeAcpSelectOption,
  normalizeCursorModels,
  resolveCursorAcpMode,
  rewriteCursorAcpMessage,
  rewriteCursorAcpStdoutLine,
  DEFAULT_CURSOR_ACP_PRINT_IDLE_MS,
  DEFAULT_CURSOR_ACP_PRINT_MAX_MS,
  MIN_CURSOR_ACP_PRINT_IDLE_MS,
  evaluatePrintTimeout,
  formatPrintTimeoutError,
  resolvePrintIdleMs,
  resolvePrintMaxMs,
  sanitizeErrorSnippet,
} from "../../../scripts/cursor-acp-bridge.mjs";
import {
  createCursorStreamJsonState,
  cursorPrintAgentArgs,
  mapCursorStreamJsonEvent,
  mapCursorStreamJsonLine,
  truncateAcpPayload,
} from "../../../scripts/cursor-stream-json-to-acp.mjs";
import { normalizeCursorModels as proxyNormalizeCursorModels } from "../../scripts/cursor-api-proxy.mjs";

const FIXTURE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/cursor-stream-json-readme.ndjson",
);

const CURSOR_SESSION_NEW_FIXTURE = {
  jsonrpc: "2.0",
  id: 2,
  result: {
    sessionId: "sess_1",
    configOptions: [
      {
        id: "model",
        name: "Model",
        type: "select",
        currentValue: "grok-4.6[effort=high,fast=true]",
        options: [
          { id: "default", name: "Auto" },
          {
            id: "grok-4.6[effort=high,fast=true]",
            name: "Cursor Grok 4.6",
          },
          {
            id: "claude-4.6-sonnet-thinking[]",
            name: "Claude 4.6 Sonnet Thinking",
          },
        ],
      },
    ],
  },
};

describe("cursor ACP schema adapter", () => {
  it("maps Cursor {id, name} select options to ACP {value, name}", () => {
    expect(normalizeAcpSelectOption({ id: "default", name: "Auto" })).toEqual({
      id: "default",
      name: "Auto",
      value: "default",
    });
    expect(
      normalizeAcpSelectOption({
        id: "grok-4.6[effort=high,fast=true]",
        name: "Cursor Grok 4.6",
      }),
    ).toMatchObject({
      value: "grok-4.6[effort=high,fast=true]",
      name: "Cursor Grok 4.6",
    });
  });

  it("rewrites the NewSessionResponse payload that OpenHands rejects", () => {
    const rewritten = rewriteCursorAcpMessage(CURSOR_SESSION_NEW_FIXTURE);
    const options = rewritten.result.configOptions[0].options;

    for (const option of options) {
      expect(option.value).toBeTruthy();
      expect(option.name).toBeTruthy();
    }
    expect(options[0]).toMatchObject({
      value: "default",
      name: "Auto",
    });
    expect(rewritten.result.configOptions[0].configId).toBe("model");
  });

  it("rewrites config_option_update notifications the same way", () => {
    const line = rewriteCursorAcpStdoutLine(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: "sess_1",
          update: {
            sessionUpdate: "config_option_update",
            configOptions: [
              {
                id: "model",
                type: "select",
                options: [{ id: "default[]", name: "Auto" }],
              },
            ],
          },
        },
      }),
    );
    const parsed = JSON.parse(line);
    expect(
      parsed.params.update.configOptions[0].options[0].value,
    ).toBe("default[]");
  });

  it("auto-answers Cursor blocking extension methods", () => {
    expect(isCursorExtensionRequest({ method: "cursor/create_plan", id: 9 })).toBe(
      true,
    );
    expect(isCursorExtensionRequest({ method: "session/request_permission", id: 9 })).toBe(
      false,
    );
    expect(cursorExtensionAutoResult("cursor/create_plan")).toEqual({
      outcome: { outcome: "accepted" },
    });
    expect(cursorExtensionAutoResult("cursor/ask_question").outcome.outcome).toBe(
      "skipped",
    );
  });

  it("spawns Cursor's documented native ACP command", () => {
    expect(nativeAgentAcpArgs("key-123")).toEqual([
      "--api-key",
      "key-123",
      "acp",
    ]);
  });

  it("defaults to print mode because native agent acp still hits RetriableError", () => {
    expect(resolveCursorAcpMode(undefined)).toBe("print");
    expect(resolveCursorAcpMode("")).toBe("print");
    expect(resolveCursorAcpMode("print")).toBe("print");
    expect(resolveCursorAcpMode("native")).toBe("native");
  });

  it("is a no-op when Cursor already speaks ACP {value, name}", () => {
    const native = {
      jsonrpc: "2.0",
      id: 3,
      result: {
        sessionId: "sess_native",
        configOptions: [
          {
            id: "mode",
            type: "select",
            currentValue: "agent",
            options: [
              { value: "agent", name: "Agent" },
              { value: "plan", name: "Plan" },
              { value: "ask", name: "Ask" },
            ],
          },
          {
            id: "model",
            type: "select",
            currentValue: "composer-2.5[fast=true]",
            options: [
              { value: "default[]", name: "Auto" },
              {
                value: "grok-4.6[effort=high,fast=true]",
                name: "grok-4.6",
              },
              { value: "composer-2.5[fast=true]", name: "composer-2.5" },
            ],
          },
        ],
      },
    };
    const rewritten = rewriteCursorAcpMessage(native);
    expect(rewritten.result.configOptions[1].options.map((o: { value: string }) => o.value)).toEqual(
      [
        "default[]",
        "grok-4.6[effort=high,fast=true]",
        "composer-2.5[fast=true]",
      ],
    );
  });
});

describe("cursor model catalog used by ACP print-mode", () => {
  const payload = {
    items: [
      {
        id: "default",
        displayName: "Auto",
        variants: [{ params: [], displayName: "Auto", isDefault: true }],
      },
      {
        id: "grok-4.6",
        displayName: "Cursor Grok 4.6",
        parameters: [
          {
            id: "effort",
            displayName: "Reasoning",
            values: [
              { value: "low", displayName: "Low" },
              { value: "high", displayName: "High" },
            ],
          },
          { id: "fast", displayName: "Fast" },
        ],
        variants: [
          {
            displayName: "Cursor Grok 4.6",
            params: [{ id: "effort", value: "low" }],
          },
          {
            displayName: "Cursor Grok 4.6",
            isDefault: true,
            params: [
              { id: "effort", value: "high" },
              { id: "fast", value: true },
            ],
          },
          {
            displayName: "Cursor Grok 4.6",
            params: [
              { id: "effort", value: "high" },
              { id: "fast", value: false },
            ],
          },
        ],
      },
      {
        id: "claude-4.6-opus-high",
        displayName: "Claude 4.6 Opus",
        variants: [
          { params: [], displayName: "Claude 4.6 Opus", isDefault: true },
        ],
      },
    ],
  };

  it("stays in lockstep with the /v1/models proxy catalog", () => {
    expect(normalizeCursorModels(payload)).toEqual(
      proxyNormalizeCursorModels(payload),
    );
  });

  it("emits ACP select options with value=parameterized Cursor model id", () => {
    const models = normalizeCursorModels(payload);
    const config = buildModelConfigOptions(
      models,
      "grok-4.6[effort=high,fast=true]",
    );

    expect(config[0].type).toBe("select");
    expect(config[0].category).toBe("model");
    expect(config[0].currentValue).toBe("grok-4.6[effort=high,fast=true]");
    expect(config[0].options).toEqual([
      { value: "default[]", name: "Auto" },
      {
        value: "grok-4.6[effort=high,fast=true]",
        name: "Cursor Grok 4.6 · High · Fast",
      },
      {
        value: "grok-4.6[effort=high,fast=false]",
        name: "Cursor Grok 4.6 · High",
      },
      { value: "claude-4.6-opus-high[]", name: "Claude 4.6 Opus" },
    ]);
    for (const option of config[0].options) {
      expect(option).not.toHaveProperty("id");
    }
  });

  it("serializes Cursor variant params the same way ACP sessions advertise", () => {
    expect(
      formatCursorModelId("grok-4.6", [
        { id: "effort", value: "high" },
        { id: "fast", value: true },
      ]),
    ).toBe("grok-4.6[effort=high,fast=true]");
  });
});

describe("cursor ACP print timeout & dual-timer configuration", () => {
  it("resolves default idle and max timeout values", () => {
    expect(resolvePrintIdleMs(undefined)).toBe(DEFAULT_CURSOR_ACP_PRINT_IDLE_MS);
    expect(DEFAULT_CURSOR_ACP_PRINT_IDLE_MS).toBe(300000); // 5 minutes
    expect(resolvePrintMaxMs(undefined, 300000)).toBe(DEFAULT_CURSOR_ACP_PRINT_MAX_MS);
    expect(DEFAULT_CURSOR_ACP_PRINT_MAX_MS).toBe(1800000); // 30 minutes
  });

  it("parses custom numeric strings from env", () => {
    expect(resolvePrintIdleMs("180000")).toBe(180000);
    expect(resolvePrintMaxMs("900000", 180000)).toBe(900000);
  });

  it("enforces minimum floor for idle timeout", () => {
    expect(resolvePrintIdleMs("1000")).toBe(DEFAULT_CURSOR_ACP_PRINT_IDLE_MS);
    expect(resolvePrintIdleMs("0")).toBe(DEFAULT_CURSOR_ACP_PRINT_IDLE_MS);
    expect(resolvePrintIdleMs("-5000")).toBe(DEFAULT_CURSOR_ACP_PRINT_IDLE_MS);
    expect(resolvePrintIdleMs("not-a-number")).toBe(DEFAULT_CURSOR_ACP_PRINT_IDLE_MS);
    expect(resolvePrintIdleMs(String(MIN_CURSOR_ACP_PRINT_IDLE_MS))).toBe(30000);
  });

  it("enforces max timeout >= idle timeout", () => {
    const idleMs = 400000;
    expect(resolvePrintMaxMs("200000", idleMs)).toBe(DEFAULT_CURSOR_ACP_PRINT_MAX_MS);
    const hugeIdle = 2000000;
    expect(resolvePrintMaxMs("1000", hugeIdle)).toBe(hugeIdle);
  });

  it("sanitizes error snippets and truncates to limit", () => {
    expect(sanitizeErrorSnippet("")).toBe("");
    expect(sanitizeErrorSnippet("  short clean message  ")).toBe("short clean message");
    const long = "a".repeat(400);
    const sanitized = sanitizeErrorSnippet(long, 50);
    expect(sanitized.startsWith("…")).toBe(true);
    expect(sanitized.length).toBe(51); // ellipsis + 50 chars
  });

  it("formats informative timeout error messages", () => {
    const msg = formatPrintTimeoutError({
      reason: "idle",
      elapsedMs: 305120,
      idleMs: 300000,
      maxMs: 1800000,
      stdoutBytes: 0,
      stderrBytes: 42,
      stderrSnippet: "connecting to model...",
    });

    expect(msg).toContain("agent -p timed out (idle)");
    expect(msg).toContain("elapsed=305.1s");
    expect(msg).toContain("idleLimit=300s");
    expect(msg).toContain("maxLimit=1800s");
    expect(msg).toContain("stdoutBytes=0");
    expect(msg).toContain("stderrBytes=42");
    expect(msg).toContain("stderr: connecting to model...");
  });

  it("formats timeout error messages without stderr snippet when stderr is empty", () => {
    const msg = formatPrintTimeoutError({
      reason: "max",
      elapsedMs: 1800500,
      idleMs: 300000,
      maxMs: 1800000,
      stdoutBytes: 120,
      stderrBytes: 0,
      stderrSnippet: "",
    });

    expect(msg).toContain("agent -p timed out (max)");
    expect(msg).not.toContain("stderr:");
  });

  describe("evaluatePrintTimeout timer logic", () => {
    const idleMs = 300000; // 5m
    const maxMs = 1800000; // 30m

    it("does not time out while running normally within idle and max limits", () => {
      const startedAt = 100000;
      const lastActivityAt = 150000;
      const now = 200000; // 100s elapsed, 50s idle

      const result = evaluatePrintTimeout({
        startedAt,
        lastActivityAt,
        now,
        idleMs,
        maxMs,
        hadActivity: true,
      });
      expect(result.timedOut).toBe(false);
      expect(result.reason).toBeNull();
      expect(result.elapsedMs).toBe(100000);
      expect(result.idleElapsedMs).toBe(50000);
    });

    it("does not idle-timeout a silent stream start before the max ceiling", () => {
      const startedAt = 0;
      const lastActivityAt = 0;
      const now = 300000;

      const result = evaluatePrintTimeout({
        startedAt,
        lastActivityAt,
        now,
        idleMs,
        maxMs,
        hadActivity: false,
      });
      expect(result.timedOut).toBe(false);
      expect(result.reason).toBeNull();
    });

    it("times out on idle only after output has been seen, then silence lasts idleMs", () => {
      const startedAt = 100000;
      const lastActivityAt = 100000;
      const now = 400000; // 300s since last stderr/stdout

      const result = evaluatePrintTimeout({
        startedAt,
        lastActivityAt,
        now,
        idleMs,
        maxMs,
        hadActivity: true,
      });
      expect(result.timedOut).toBe(true);
      expect(result.reason).toBe("idle");
      expect(result.idleElapsedMs).toBe(300000);
    });

    it("does NOT time out at 122s if idle limit is 300s (resolves previous 120s bug)", () => {
      const startedAt = 0;
      const lastActivityAt = 0;
      const now = 122000; // 122s elapsed, exactly where previous hard timeout killed the process

      const result = evaluatePrintTimeout({
        startedAt,
        lastActivityAt,
        now,
        idleMs,
        maxMs,
      });
      expect(result.timedOut).toBe(false);
      expect(result.reason).toBeNull();
    });

    it("allows execution past 120s as long as activity resets lastActivityAt", () => {
      const startedAt = 0;
      const lastActivityAt = 130000; // activity at 130s
      const now = 200000; // 200s elapsed, 70s idle

      const result = evaluatePrintTimeout({
        startedAt,
        lastActivityAt,
        now,
        idleMs,
        maxMs,
        hadActivity: true,
      });
      expect(result.timedOut).toBe(false);
      expect(result.reason).toBeNull();
    });

    it("triggers max ceiling timeout when total elapsed >= maxMs even with recent activity", () => {
      const startedAt = 0;
      const lastActivityAt = 1795000; // activity 5s ago
      const now = 1800001; // 1800.001s elapsed (exceeds 30m max)

      const result = evaluatePrintTimeout({
        startedAt,
        lastActivityAt,
        now,
        idleMs,
        maxMs,
      });
      expect(result.timedOut).toBe(true);
      expect(result.reason).toBe("max");
    });

    it("treats each stdout NDJSON line as activity that resets idle", () => {
      const startedAt = 0;
      const lastActivityAt = 290000;
      const now = 310000;

      const result = evaluatePrintTimeout({
        startedAt,
        lastActivityAt,
        now,
        idleMs,
        maxMs,
        hadActivity: true,
      });
      expect(result.timedOut).toBe(false);
    });
  });
});

describe("cursor stream-json to ACP mapper", () => {
  it("uses stream-json with partial output for print-mode agent args", () => {
    expect(cursorPrintAgentArgs("grok-4.6[fast=true]")).toEqual([
      "-p",
      "--trust",
      "-f",
      "--output-format",
      "stream-json",
      "--stream-partial-output",
      "--model",
      "grok-4.6[fast=true]",
    ]);
  });

  it("maps the documented fixture without duplicating assistant text or result", () => {
    const state = createCursorStreamJsonState();
    const updates: Array<{
      sessionUpdate: string;
      content?: { type: string; text: string };
      toolCallId?: string;
      kind?: string;
      title?: string;
      status?: string;
      rawInput?: unknown;
      rawOutput?: unknown;
    }> = [];
    for (const line of readFileSync(FIXTURE_PATH, "utf8").split("\n")) {
      if (!line.trim() || line.startsWith("#")) continue;
      updates.push(
        ...(mapCursorStreamJsonLine(line, state).updates as typeof updates),
      );
    }

    expect(updates.map((update) => update.sessionUpdate)).toEqual([
      "agent_thought_chunk",
      "agent_message_chunk",
      "agent_message_chunk",
      "tool_call",
      "tool_call_update",
      "tool_call",
      "tool_call_update",
      "tool_call",
      "tool_call_update",
      "agent_message_chunk",
    ]);
    expect(
      updates
        .filter((update) => update.sessionUpdate === "agent_message_chunk")
        .map((update) => update.content?.text ?? "")
        .join(""),
    ).toBe("I'll read README.mdOK");
    expect(state.emittedAssistant).toBe(true);
    expect(state.sawSuccessResult).toBe(true);
    expect(state.isError).toBe(false);
    expect(state.resultText).toBe("I'll read README.mdOK");

    expect(updates[3]).toMatchObject({
      sessionUpdate: "tool_call",
      toolCallId: "toolu_read_1",
      kind: "read",
      title: "README.md",
      status: "in_progress",
      rawInput: { path: "README.md" },
    });
    expect(updates[4]).toMatchObject({
      sessionUpdate: "tool_call_update",
      toolCallId: "toolu_read_1",
      status: "completed",
    });
    expect(updates[5]).toMatchObject({
      kind: "execute",
      title: "ls",
      status: "in_progress",
    });
    expect(updates[7]).toMatchObject({
      kind: "other",
      title: "mystery_tool",
    });
    expect(updates[8]).toMatchObject({
      sessionUpdate: "tool_call_update",
      toolCallId: "toolu_fn_1",
      status: "completed",
    });
  });

  it("emits legacy complete assistant messages when no partial timestamps exist", () => {
    const state = createCursorStreamJsonState();
    const { updates } = mapCursorStreamJsonEvent(
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Hello" }],
        },
      },
      state,
    );
    expect(updates).toEqual([
      {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Hello" },
      },
    ]);
  });

  it("maps failed tool results and ignores unknown event types", () => {
    const state = createCursorStreamJsonState();
    expect(
      mapCursorStreamJsonEvent({ type: "progress", percent: 10 }, state).updates,
    ).toEqual([]);
    const failed = mapCursorStreamJsonEvent(
      {
        type: "tool_call",
        subtype: "completed",
        call_id: "t-fail",
        tool_call: {
          fetchToolCall: {
            args: { url: "https://example.com" },
            result: { error: "timeout" },
          },
        },
      },
      state,
    );
    expect(failed.updates[0]).toMatchObject({
      sessionUpdate: "tool_call_update",
      toolCallId: "t-fail",
      status: "failed",
      rawOutput: "timeout",
    });
  });

  it("truncates huge tool output", () => {
    const truncated = truncateAcpPayload("x".repeat(9000));
    expect(truncated.endsWith("…")).toBe(true);
    expect(truncated.length).toBe(8001);
  });
});

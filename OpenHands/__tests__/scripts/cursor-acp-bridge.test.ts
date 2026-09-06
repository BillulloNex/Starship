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
} from "../../../scripts/cursor-acp-bridge.mjs";
import { normalizeCursorModels as proxyNormalizeCursorModels } from "../../scripts/cursor-api-proxy.mjs";

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
    expect(rewritten.result.configOptions[1].options.map((o) => o.value)).toEqual(
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

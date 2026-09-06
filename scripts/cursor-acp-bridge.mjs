#!/usr/bin/env node
/**
 * Cursor ACP adapter for Starship.
 *
 * Native path (default): spawn Cursor's documented ACP server (`agent acp`)
 * and rewrite its session config options to the Agent Client Protocol shape
 * that OpenHands' Pydantic `NewSessionResponse` validates.
 *
 * Cursor advertises select choices as `{id, name}`. ACP (and the OpenHands
 * SDK) require `{value, name}`:
 * https://agentclientprotocol.com/protocol/v2/session-config-options
 *
 * Print-mode fallback (`CURSOR_ACP_MODE=print`): `agent -p` JSON-RPC shim
 * used only if native ACP is unavailable. Model ids still come from
 * Cursor's `/v1/models` catalog and keep the parameterized ACP form.
 */

import * as child_process from "node:child_process";
import * as readline from "node:readline";
import * as crypto from "node:crypto";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

const AGENT_BIN = process.env.CURSOR_AGENT_BIN || "agent";
const CURSOR_KEY = process.env.CURSOR_API_KEY || "";
const CURSOR_API_BASE_URL =
  process.env.CURSOR_API_BASE_URL || "https://api.cursor.com";
const ACP_MODE = (process.env.CURSOR_ACP_MODE || "native").toLowerCase();

const debug = (...args) =>
  process.stderr.write(`[cursor-acp-bridge] ${args.join(" ")}\n`);

let sessionId = null;
let sessionCwd = "/tmp";
let currentModel = null;
let currentMode = "agent";
let cachedConfigOptions = null;

export function formatCursorModelId(baseId, params = []) {
  const serialized = params
    .filter((param) => param && typeof param.id === "string")
    .map((param) => `${param.id}=${String(param.value)}`)
    .join(",");
  return `${baseId}[${serialized}]`;
}

function titleCase(value) {
  return String(value)
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function variantLabel(item, variant) {
  const parameterMap = new Map(
    (item.parameters || []).map((parameter) => [parameter.id, parameter]),
  );
  const suffixes = [];
  for (const param of variant.params || []) {
    if (param.id === "cyber") continue;
    const definition = parameterMap.get(param.id);
    const valueDefinition = definition?.values?.find(
      (candidate) => String(candidate.value) === String(param.value),
    );
    if (String(param.value) === "false") continue;
    if (String(param.value) === "true") {
      suffixes.push(definition?.displayName || titleCase(param.id));
      continue;
    }
    suffixes.push(
      valueDefinition?.displayName || titleCase(String(param.value)),
    );
  }
  return [variant.displayName || item.displayName || item.id, ...suffixes].join(
    " · ",
  );
}

export function normalizeCursorModels(payload) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return items.flatMap((item) => {
    if (!item || typeof item.id !== "string") return [];
    const variants = Array.isArray(item.variants) ? item.variants : [];
    const preferred =
      variants.find((variant) => variant?.isDefault === true) ||
      variants[0] || { params: [], displayName: item.displayName };
    const params = Array.isArray(preferred.params) ? preferred.params : [];
    return [
      {
        id: formatCursorModelId(item.id, params),
        baseId: item.id,
        label: variants.length === 0 ? item.displayName || item.id : variantLabel(item, preferred),
        params: params.map((param) => ({
          id: String(param.id),
          value: String(param.value),
        })),
        isDefault: item.id === "default",
      },
    ];
  });
}

/**
 * ACP SessionConfigSelectOption uses `value` as the selection id.
 * Cursor's ACP dialect uses `id` for the same field.
 */
export function normalizeAcpSelectOption(option) {
  if (!option || typeof option !== "object" || Array.isArray(option)) {
    return option;
  }
  const value = option.value ?? option.id;
  if (value == null || value === "") return option;
  return {
    ...option,
    value: String(value),
    name: option.name ?? String(value),
  };
}

export function normalizeAcpConfigOption(option) {
  if (!option || typeof option !== "object" || Array.isArray(option)) {
    return option;
  }
  const next = { ...option };
  if (next.configId == null && typeof next.id === "string") {
    next.configId = next.id;
  }
  if (Array.isArray(next.options)) {
    next.options = next.options.map(normalizeAcpSelectOption);
  }
  return next;
}

export function normalizeAcpConfigOptions(options) {
  if (!Array.isArray(options)) return options;
  return options.map(normalizeAcpConfigOption);
}

export function normalizeAcpSessionPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }
  const next = { ...payload };
  if (Array.isArray(next.configOptions)) {
    next.configOptions = normalizeAcpConfigOptions(next.configOptions);
  }
  if (next.update && typeof next.update === "object") {
    next.update = normalizeAcpSessionPayload(next.update);
  }
  return next;
}

export function rewriteCursorAcpMessage(message) {
  if (!message || typeof message !== "object") return message;
  const next = { ...message };
  if (next.result && typeof next.result === "object") {
    next.result = normalizeAcpSessionPayload(next.result);
  }
  if (next.params && typeof next.params === "object") {
    next.params = normalizeAcpSessionPayload(next.params);
  }
  return next;
}

export function rewriteCursorAcpStdoutLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed.startsWith("{")) return line;
  try {
    return JSON.stringify(rewriteCursorAcpMessage(JSON.parse(trimmed)));
  } catch {
    return line;
  }
}

export function cursorExtensionAutoResult(method) {
  if (method === "cursor/ask_question") {
    return { outcome: { outcome: "skipped", reason: "No question UI" } };
  }
  if (method === "cursor/create_plan") {
    return { outcome: { outcome: "accepted" } };
  }
  return { outcome: { outcome: "cancelled" } };
}

export function isCursorExtensionRequest(message) {
  return (
    message &&
    typeof message.method === "string" &&
    message.method.startsWith("cursor/") &&
    message.id != null
  );
}

export function buildModelConfigOptions(models, selectedId) {
  const options = models.map((model) => ({
    value: model.id,
    name: model.label || model.id,
  }));
  const currentValue =
    (selectedId && models.some((model) => model.id === selectedId)
      ? selectedId
      : null) ||
    models.find((model) => model.isDefault)?.id ||
    models[0]?.id ||
    "default[]";
  return [
    {
      id: "model",
      configId: "model",
      name: "Model",
      category: "model",
      type: "select",
      options,
      currentValue,
    },
  ];
}

function cursorAuthHeaders() {
  return {
    Accept: "application/json",
    Authorization: `Basic ${Buffer.from(`${CURSOR_KEY}:`).toString("base64")}`,
    "User-Agent": "grokbot-cursor-acp/1.0",
  };
}

async function fetchModelsFromCursorAPI() {
  if (cachedConfigOptions) return cachedConfigOptions;
  if (!CURSOR_KEY) return null;
  try {
    const resp = await fetch(`${CURSOR_API_BASE_URL}/v1/models`, {
      headers: cursorAuthHeaders(),
    });
    if (!resp.ok) {
      debug("Failed to fetch models:", resp.status);
      return null;
    }
    const models = normalizeCursorModels(await resp.json());
    cachedConfigOptions = buildModelConfigOptions(models, currentModel);
    debug(`Fetched ${models.length} models from Cursor API`);
    return cachedConfigOptions;
  } catch (err) {
    debug("Error fetching models:", err.message);
    return null;
  }
}

function sendRpc(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

function sendResult(id, result) {
  sendRpc({ jsonrpc: "2.0", id, result });
}

function sendError(id, code, message) {
  sendRpc({ jsonrpc: "2.0", id, error: { code, message } });
}

function sendNotification(method, params) {
  sendRpc({ jsonrpc: "2.0", method, params });
}

function handleInitialize(id) {
  sendResult(id, {
    protocolVersion: 1,
    agentInfo: {
      name: "cursor-acp-bridge",
      title: "Cursor ACP Bridge",
      version: "1.1.0",
    },
    agentCapabilities: {
      loadSession: false,
      mcpCapabilities: { http: false, sse: false },
      promptCapabilities: {},
    },
  });
}

async function handleNewSession(id, params) {
  sessionId = crypto.randomUUID();
  sessionCwd = params?.cwd || "/tmp";
  currentMode = params?.modeId || "agent";
  debug(`New session: ${sessionId}, cwd: ${sessionCwd}`);

  const configOptions = await fetchModelsFromCursorAPI();
  const result = {
    sessionId,
    modes: {
      currentModeId: currentMode,
      availableModes: [
        { id: "agent", name: "Agent" },
        { id: "plan", name: "Plan" },
        { id: "ask", name: "Ask" },
      ],
    },
  };
  if (configOptions) {
    result.configOptions = configOptions;
  }
  sendResult(id, result);
}

function handleSetConfigOption(id, params) {
  const configId = params?.configId || params?.id;
  if (configId === "model") {
    currentModel = params.value || null;
    if (cachedConfigOptions?.[0]) {
      cachedConfigOptions = [
        { ...cachedConfigOptions[0], currentValue: currentModel },
      ];
    }
    debug(`Model set to: ${currentModel}`);
  }
  sendResult(
    id,
    cachedConfigOptions ? { configOptions: cachedConfigOptions } : {},
  );
}

function handleSetMode(id, params) {
  currentMode = params?.modeId || currentMode;
  debug(`Mode set to: ${currentMode}`);
  sendResult(id, {});
}

async function handlePrompt(id, params) {
  const sid = params?.sessionId || sessionId;
  const promptBlocks = params?.prompt || [];
  let userText = "";
  for (const block of promptBlocks) {
    if (block?.type === "text" && block.text) {
      userText += block.text;
    }
  }
  debug(
    `Prompt (session=${sid}, model=${currentModel || "default"}): ${userText.slice(0, 80)}…`,
  );

  sendNotification("session/update", {
    sessionId: sid,
    update: {
      sessionUpdate: "available_commands_update",
      commands: [],
    },
  });
  sendNotification("session/update", {
    sessionId: sid,
    update: {
      sessionUpdate: "session_info_update",
      sessionInfo: {
        model: currentModel || "default",
        mode: currentMode,
      },
    },
  });

  try {
    const result = await callAgentPrint(userText, sessionCwd);
    sendNotification("session/update", {
      sessionId: sid,
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: result.text },
      },
    });
    sendResult(id, { stopReason: "end_turn" });
  } catch (err) {
    debug(`Error calling agent -p: ${err.message}`);
    sendNotification("session/update", {
      sessionId: sid,
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: `Error: ${err.message}` },
      },
    });
    sendResult(id, { stopReason: "end_turn" });
  }
}

function callAgentPrint(text, cwd) {
  return new Promise((resolve, reject) => {
    const args = ["-p", "--trust", "-f", "--output-format", "json"];
    if (currentModel) {
      args.push("--model", currentModel);
    }
    args.push(text);

    debug(`Spawning: ${AGENT_BIN} ${args.slice(0, 6).join(" ")}…`);

    const proc = child_process.spawn(AGENT_BIN, args, {
      cwd,
      env: {
        ...process.env,
        CURSOR_API_KEY: CURSOR_KEY,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    const timeout = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error("agent -p timed out after 120s"));
    }, 120000);

    proc.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        debug(
          `agent -p exited with code ${code}. stderr: ${stderr.slice(0, 200)}`,
        );
        reject(
          new Error(`agent -p failed (exit ${code}): ${stderr.slice(0, 200)}`),
        );
        return;
      }
      try {
        const parsed = JSON.parse(stdout.trim());
        if (parsed.is_error) {
          reject(new Error(parsed.result || "Unknown error from agent -p"));
          return;
        }
        resolve({
          text: parsed.result || "",
          usage: parsed.usage || {},
          sessionId: parsed.session_id,
        });
      } catch {
        resolve({ text: stdout.trim(), usage: {} });
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

async function handlePrintModeMessage(msg) {
  const { id, method, params } = msg;

  switch (method) {
    case "initialize":
      handleInitialize(id);
      break;
    case "authenticate":
      sendResult(id, {});
      break;
    case "session/new":
      await handleNewSession(id, params);
      break;
    case "session/prompt":
      await handlePrompt(id, params);
      break;
    case "session/set_config_option":
      handleSetConfigOption(id, params);
      break;
    case "session/set_mode":
      handleSetMode(id, params);
      break;
    case "session/cancel":
      sendResult(id, {});
      break;
    case "session/end":
      sessionId = null;
      sendResult(id, {});
      break;
    case "notifications/initialized":
      break;
    default:
      if (id != null) {
        sendError(id, -32601, `Method not found: ${method}`);
      }
      break;
  }
}

function startPrintMode() {
  debug("Starting Cursor ACP print-mode fallback (agent -p)");
  if (!CURSOR_KEY) debug("WARNING: CURSOR_API_KEY not set");

  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

  rl.on("line", async (line) => {
    if (!line.trim()) return;
    try {
      await handlePrintModeMessage(JSON.parse(line));
    } catch (err) {
      debug(`Parse error: ${err.message}`);
    }
  });

  rl.on("close", () => {
    debug("stdin closed, exiting");
    process.exit(0);
  });
}

export function nativeAgentAcpArgs(apiKey = CURSOR_KEY) {
  const args = [];
  if (apiKey) args.push("--api-key", apiKey);
  args.push("acp");
  return args;
}

function startNativeMode() {
  const args = nativeAgentAcpArgs();
  debug(`Starting native Cursor ACP: ${AGENT_BIN} ${args.join(" ")}`);
  if (!CURSOR_KEY) debug("WARNING: CURSOR_API_KEY not set");

  const child = child_process.spawn(AGENT_BIN, args, {
    env: {
      ...process.env,
      CURSOR_API_KEY: CURSOR_KEY,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  child.on("error", (err) => {
    debug(`Failed to spawn ${AGENT_BIN}: ${err.message}`);
    process.exit(1);
  });
  child.on("exit", (code, signal) => {
    debug(`agent acp exited code=${code} signal=${signal || ""}`);
    process.exit(code ?? 1);
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(chunk);
  });

  const parentRl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });
  parentRl.on("line", (line) => {
    if (!line.trim()) return;
    child.stdin.write(`${line}\n`);
  });
  parentRl.on("close", () => {
    child.stdin.end();
  });

  const childRl = readline.createInterface({
    input: child.stdout,
    crlfDelay: Infinity,
  });
  childRl.on("line", (line) => {
    if (!line.trim()) return;
    try {
      const msg = JSON.parse(line);
      if (isCursorExtensionRequest(msg)) {
        debug(`Auto-answering Cursor extension ${msg.method}`);
        child.stdin.write(
          `${JSON.stringify({
            jsonrpc: "2.0",
            id: msg.id,
            result: cursorExtensionAutoResult(msg.method),
          })}\n`,
        );
        return;
      }
      process.stdout.write(`${rewriteCursorAcpStdoutLine(line)}\n`);
    } catch {
      process.stdout.write(`${line}\n`);
    }
  });
}

function main() {
  process.on("SIGTERM", () => process.exit(0));
  process.on("SIGINT", () => process.exit(0));

  if (ACP_MODE === "print" || ACP_MODE === "print-mode") {
    startPrintMode();
    return;
  }
  startNativeMode();
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  main();
}

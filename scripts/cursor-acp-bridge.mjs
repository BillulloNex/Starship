#!/usr/bin/env node
/**
 * Cursor ACP Bridge for Starship
 *
 * Works around Cursor's buggy `agent acp` mode (which returns
 * "RetriableError: [internal] Failed to run step, exceeded max retries")
 * by implementing the ACP JSON-RPC protocol on stdio and delegating each
 * prompt to `agent -p` (print mode), which works reliably.
 *
 * Drop-in replacement: `cursor-acp-auth-wrapper.sh` execs this instead
 * of `agent … acp`.
 */

import * as child_process from "node:child_process";
import * as readline from "node:readline";
import * as crypto from "node:crypto";
import * as path from "node:path";
import * as fs from "node:fs";

// ─── Config ──────────────────────────────────────────────────────────
const AGENT_BIN =
  process.env.CURSOR_AGENT_BIN || "agent";
const CURSOR_KEY = process.env.CURSOR_API_KEY || "";

const debug = (...args) =>
  process.stderr.write(`[cursor-acp-bridge] ${args.join(" ")}\n`);

// ─── State ───────────────────────────────────────────────────────────
let sessionId = null;
let sessionCwd = "/tmp";
let currentModel = null; // null = default
let currentMode = "agent"; // "agent" or "ask"

// ─── ACP model list (fetched on session/new) ──────────────────────────
let cachedConfigOptions = null;

async function fetchModelsFromCursorAPI() {
  if (cachedConfigOptions) return cachedConfigOptions;
  try {
    const resp = await fetch("https://api.cursor.com/v1/models", {
      headers: { Authorization: `Bearer ${CURSOR_KEY}` },
    });
    if (!resp.ok) {
      debug("Failed to fetch models:", resp.status);
      return null;
    }
    const data = await resp.json();
    const items = Array.isArray(data?.items) ? data.items : [];
    const modelValues = [];
    for (const item of items) {
      if (!item?.id) continue;
      const variants = Array.isArray(item.variants) ? item.variants : [];
      if (variants.length === 0) {
        modelValues.push({
          value: `${item.id}[]`,
          name: item.displayName || item.id,
        });
        continue;
      }
      // Pick the default variant
      const preferred =
        variants.find((v) => v?.isDefault) || variants[0] || { params: [] };
      const params = Array.isArray(preferred.params) ? preferred.params : [];
      const paramStr = params
        .filter((p) => p?.id)
        .map((p) => `${p.id}=${p.value}`)
        .join(",");
      modelValues.push({
        value: `${item.id}[${paramStr}]`,
        name: preferred.displayName || item.displayName || item.id,
      });
    }
    cachedConfigOptions = [
      {
        id: "model",
        displayName: "Model",
        type: "select",
        values: modelValues,
        currentValue:
          modelValues.find((v) => v.value.startsWith("default["))?.value ||
          modelValues[0]?.value ||
          "default[]",
      },
    ];
    debug(`Fetched ${modelValues.length} models from Cursor API`);
    return cachedConfigOptions;
  } catch (err) {
    debug("Error fetching models:", err.message);
    return null;
  }
}

// ─── JSON-RPC helpers ────────────────────────────────────────────────
function sendRpc(obj) {
  const line = JSON.stringify(obj);
  process.stdout.write(line + "\n");
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

// ─── Handler: initialize ────────────────────────────────────────────
function handleInitialize(id) {
  sendResult(id, {
    protocolVersion: 1,
    agentInfo: {
      name: "cursor-acp-bridge",
      title: "Cursor ACP Bridge (via agent -p)",
      version: "1.0.0",
    },
    agentCapabilities: {
      loadSession: false,
      mcpCapabilities: { http: false, sse: false },
      promptCapabilities: {},
    },
  });
}

// ─── Handler: session/new ───────────────────────────────────────────
async function handleNewSession(id, params) {
  sessionId = crypto.randomUUID();
  sessionCwd = params?.cwd || "/tmp";
  currentModel = null;
  currentMode = params?.modeId || "agent";
  debug(`New session: ${sessionId}, cwd: ${sessionCwd}`);

  // Fetch config options (model list)
  const configOptions = await fetchModelsFromCursorAPI();

  const result = {
    sessionId,
    modes: {
      currentModeId: currentMode,
      availableModes: [
        { id: "agent", name: "Agent" },
        { id: "ask", name: "Ask" },
      ],
    },
  };
  if (configOptions) {
    result.configOptions = configOptions;
  }
  sendResult(id, result);
}

// ─── Handler: session/set_config_option ─────────────────────────────
function handleSetConfigOption(id, params) {
  if (params?.configId === "model") {
    const value = params.value || "";
    // Extract base model ID from "modelId[params]" format
    const match = value.match(/^([^[]+)/);
    currentModel = match ? match[1] : value;
    debug(`Model set to: ${currentModel} (raw: ${value})`);
    sendResult(id, {});
  } else {
    sendResult(id, {});
  }
}

// ─── Handler: session/set_mode ──────────────────────────────────────
function handleSetMode(id, params) {
  currentMode = params?.modeId || currentMode;
  debug(`Mode set to: ${currentMode}`);
  sendResult(id, {});
}

// ─── Handler: session/prompt ────────────────────────────────────────
async function handlePrompt(id, params) {
  const sid = params?.sessionId || sessionId;
  const promptBlocks = params?.prompt || [];

  // Extract user text from prompt blocks
  let userText = "";
  for (const block of promptBlocks) {
    if (block?.type === "text" && block.text) {
      userText += block.text;
    }
  }
  debug(`Prompt (session=${sid}, model=${currentModel || "default"}): ${userText.slice(0, 80)}…`);

  // Send available_commands_update notification
  sendNotification("session/update", {
    sessionId: sid,
    update: {
      sessionUpdate: "available_commands_update",
      commands: [],
    },
  });

  // Send session_info_update notification
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

    // Stream the response as agent_message_chunk notifications
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
    // Send error message as agent text
    sendNotification("session/update", {
      sessionId: sid,
      update: {
        sessionUpdate: "agent_message_chunk",
        content: {
          type: "text",
          text: `Error: ${err.message}`,
        },
      },
    });
    sendResult(id, { stopReason: "end_turn" });
  }
}

// ─── Agent -p invocation ─────────────────────────────────────────────
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
        debug(`agent -p exited with code ${code}. stderr: ${stderr.slice(0, 200)}`);
        reject(new Error(`agent -p failed (exit ${code}): ${stderr.slice(0, 200)}`));
        return;
      }
      try {
        // Parse the JSON output
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
      } catch (parseErr) {
        // If not JSON, return raw stdout as text
        resolve({ text: stdout.trim(), usage: {} });
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

// ─── Handler: session/cancel ────────────────────────────────────────
function handleCancel(id) {
  sendResult(id, {});
}

// ─── Handler: session/end ───────────────────────────────────────────
function handleEndSession(id) {
  sessionId = null;
  sendResult(id, {});
}

// ─── Router ──────────────────────────────────────────────────────────
async function handleMessage(msg) {
  const { id, method, params } = msg;

  switch (method) {
    case "initialize":
      handleInitialize(id);
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
      handleCancel(id);
      break;
    case "session/end":
      handleEndSession(id);
      break;
    case "notifications/initialized":
      // Client notification, no response needed
      break;
    default:
      if (id != null) {
        sendError(id, -32601, `Method not found: ${method}`);
      }
      break;
  }
}

// ─── Main ────────────────────────────────────────────────────────────
debug("Starting Cursor ACP Bridge (agent -p mode)");

if (!CURSOR_KEY) {
  debug("WARNING: CURSOR_API_KEY not set");
}

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

rl.on("line", async (line) => {
  if (!line.trim()) return;
  try {
    const msg = JSON.parse(line);
    await handleMessage(msg);
  } catch (err) {
    debug(`Parse error: ${err.message}`);
  }
});

rl.on("close", () => {
  debug("stdin closed, exiting");
  process.exit(0);
});

process.on("SIGTERM", () => {
  debug("SIGTERM received");
  process.exit(0);
});

process.on("SIGINT", () => {
  debug("SIGINT received");
  process.exit(0);
});

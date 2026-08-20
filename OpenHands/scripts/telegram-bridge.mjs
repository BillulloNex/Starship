#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const TELEGRAM_MESSAGE_LIMIT = 3900;
const TERMINAL_STATUSES = new Set([
  "idle",
  "paused",
  "waiting_for_confirmation",
  "finished",
  "error",
  "stuck",
]);

const HELP_TEXT = `GrokBot Telegram commands:
/new [task] — start a fresh conversation
/latest — attach to the most recently updated conversation
/use <conversation-id> — attach to a specific conversation
/status — show the attached conversation and latest reply
/stop — interrupt the running agent
/whoami — show your Telegram user ID
/help — show this help

Send any other text to continue the attached conversation. If none is attached, GrokBot starts a new one.`;

export function parseAllowedUserIds(value = "") {
  return new Set(
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => /^\d+$/.test(entry)),
  );
}

export function parseCommand(text = "") {
  const match = text
    .trim()
    .match(/^\/([a-z]+)(?:@[a-z0-9_]+)?(?:\s+([\s\S]*))?$/i);
  if (!match) return null;
  return { name: match[1].toLowerCase(), argument: match[2]?.trim() ?? "" };
}

export function splitTelegramMessage(text, limit = TELEGRAM_MESSAGE_LIMIT) {
  const value = String(text ?? "").trim();
  if (!value) return [];

  const chunks = [];
  let remaining = value;
  while (remaining.length > limit) {
    let splitAt = remaining.lastIndexOf("\n", limit);
    if (splitAt < Math.floor(limit / 2)) {
      splitAt = remaining.lastIndexOf(" ", limit);
    }
    if (splitAt < Math.floor(limit / 2)) splitAt = limit;
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

class JsonHttpClient {
  constructor({ baseUrl, headers = {}, fetchImpl = fetch }) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.headers = headers;
    this.fetchImpl = fetchImpl;
  }

  async request(endpoint, { method = "GET", body, timeoutMs = 60_000 } = {}) {
    const response = await this.fetchImpl(`${this.baseUrl}${endpoint}`, {
      method,
      headers: {
        accept: "application/json",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...this.headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const detail =
        payload?.detail ?? payload?.description ?? response.statusText;
      throw new Error(`HTTP ${response.status}: ${detail || "request failed"}`);
    }
    return payload;
  }
}

export class TelegramApi {
  constructor({ token, fetchImpl = fetch }) {
    this.client = new JsonHttpClient({
      baseUrl: `https://api.telegram.org/bot${token}`,
      fetchImpl,
    });
  }

  call(method, payload = {}, timeoutMs = 60_000) {
    return this.client
      .request(`/${method}`, { method: "POST", body: payload, timeoutMs })
      .then((response) => {
        if (!response?.ok) {
          throw new Error(response?.description || `Telegram ${method} failed`);
        }
        return response.result;
      });
  }

  getMe() {
    return this.call("getMe");
  }

  getUpdates(offset, timeoutSeconds) {
    return this.call(
      "getUpdates",
      {
        offset,
        timeout: timeoutSeconds,
        allowed_updates: ["message"],
      },
      (timeoutSeconds + 10) * 1000,
    );
  }

  sendMessage(chatId, text) {
    return this.call("sendMessage", {
      chat_id: chatId,
      text,
      link_preview_options: { is_disabled: true },
    });
  }

  sendTyping(chatId) {
    return this.call("sendChatAction", { chat_id: chatId, action: "typing" });
  }
}

export class AgentServerApi {
  constructor({ baseUrl, apiKey, fetchImpl = fetch }) {
    this.client = new JsonHttpClient({
      baseUrl,
      headers: { "X-Session-API-Key": apiKey },
      fetchImpl,
    });
  }

  async resolveAgentProfileId(configuredProfileId) {
    if (configuredProfileId) return configuredProfileId;
    const response = await this.client.request("/api/agent-profiles");
    if (response?.active_agent_profile_id)
      return response.active_agent_profile_id;
    const usable = (response?.profiles ?? []).filter((profile) => profile?.id);
    if (usable.length === 1) return usable[0].id;
    throw new Error(
      "No active Agent Profile is configured. Select one in GrokBot settings or set TELEGRAM_AGENT_PROFILE_ID.",
    );
  }

  async createConversation({ prompt, profileId, workingDir, chatId }) {
    const resolvedProfileId = await this.resolveAgentProfileId(profileId);
    return this.client.request("/api/conversations", {
      method: "POST",
      timeoutMs: 5 * 60_000,
      body: {
        agent_profile_id: resolvedProfileId,
        workspace: { kind: "LocalWorkspace", working_dir: workingDir },
        confirmation_policy: { kind: "NeverConfirm" },
        max_iterations: 500,
        stuck_detection: true,
        autotitle: true,
        worktree: true,
        tags: { channel: "telegram", telegramchat: String(chatId) },
        ...(prompt
          ? {
              initial_message: {
                role: "user",
                content: [{ type: "text", text: prompt }],
                run: true,
              },
            }
          : {}),
      },
    });
  }

  getConversation(conversationId) {
    return this.client.request(`/api/conversations/${conversationId}`);
  }

  async getLatestConversation() {
    const response = await this.client.request(
      "/api/conversations/search?limit=1&sort_order=UPDATED_AT_DESC",
    );
    return response?.items?.[0] ?? null;
  }

  sendMessage(conversationId, text) {
    return this.client.request(`/api/conversations/${conversationId}/events`, {
      method: "POST",
      body: {
        role: "user",
        content: [{ type: "text", text }],
        run: true,
      },
    });
  }

  getFinalResponse(conversationId) {
    return this.client
      .request(`/api/conversations/${conversationId}/agent_final_response`)
      .then((result) => result?.response ?? "");
  }

  getEventCount(conversationId) {
    return this.client.request(
      `/api/conversations/${conversationId}/events/count`,
    );
  }

  interrupt(conversationId) {
    return this.client.request(
      `/api/conversations/${conversationId}/interrupt`,
      {
        method: "POST",
        body: {},
      },
    );
  }
}

export class JsonBridgeState {
  constructor(filePath) {
    this.filePath = filePath;
    this.state = { conversations: {} };
    this.writeQueue = Promise.resolve();
  }

  async load() {
    try {
      this.state = JSON.parse(await fs.readFile(this.filePath, "utf8"));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  getConversationId(chatId) {
    return this.state.conversations?.[String(chatId)] ?? null;
  }

  async setConversationId(chatId, conversationId) {
    this.state.conversations ??= {};
    this.state.conversations[String(chatId)] = conversationId;
    this.writeQueue = this.writeQueue
      .catch(() => undefined)
      .then(async () => {
        await fs.mkdir(path.dirname(this.filePath), { recursive: true });
        const temporaryPath = `${this.filePath}.tmp`;
        await fs.writeFile(
          temporaryPath,
          `${JSON.stringify(this.state, null, 2)}\n`,
          { mode: 0o600 },
        );
        await fs.rename(temporaryPath, this.filePath);
      });
    await this.writeQueue;
  }
}

function conversationLink(publicUrl, conversationId) {
  if (!publicUrl) return "";
  return `${publicUrl.replace(/\/$/, "")}/conversations/${conversationId}`;
}

function statusMessage(conversation, publicUrl) {
  const link = conversationLink(publicUrl, conversation.id);
  return [
    conversation.title || "Untitled conversation",
    `Status: ${conversation.execution_status ?? "unknown"}`,
    `ID: ${conversation.id}`,
    ...(link ? [link] : []),
  ].join("\n");
}

export function createTelegramUpdateHandler({
  telegram,
  agent,
  state,
  allowedUserIds,
  profileId = "",
  workingDir = "/projects/Grokbot",
  publicUrl = "",
  responseTimeoutMs = 30 * 60_000,
  pollIntervalMs = 2000,
  sleep = (duration) => new Promise((resolve) => setTimeout(resolve, duration)),
  now = () => Date.now(),
  logger = console,
}) {
  const send = async (chatId, text) => {
    const chunks = splitTelegramMessage(text);
    for (const chunk of chunks) await telegram.sendMessage(chatId, chunk);
  };

  const waitForResponse = async (
    chatId,
    conversationId,
    previousResponse = "",
    previousEventCount = 0,
  ) => {
    const startedAt = now();
    let sawRunning = false;
    let lastTypingAt = 0;

    while (now() - startedAt < responseTimeoutMs) {
      if (now() - lastTypingAt >= 4000) {
        await telegram.sendTyping(chatId).catch(() => undefined);
        lastTypingAt = now();
      }

      const conversation = await agent.getConversation(conversationId);
      const status = conversation.execution_status ?? "unknown";
      if (status === "running") sawRunning = true;

      if (status === "waiting_for_confirmation") {
        return "The agent is waiting for confirmation. Open this conversation in GrokBot to approve or reject the action.";
      }

      if (status === "paused") return "The agent is paused.";
      if (status === "error" || status === "stuck") {
        const finalResponse = await agent.getFinalResponse(conversationId);
        return finalResponse || `The agent stopped with status: ${status}.`;
      }

      if (TERMINAL_STATUSES.has(status)) {
        const [finalResponse, eventCount] = await Promise.all([
          agent.getFinalResponse(conversationId),
          agent.getEventCount(conversationId),
        ]);
        const hasNewAgentEvent =
          sawRunning || eventCount >= previousEventCount + 2;
        if (
          finalResponse &&
          (hasNewAgentEvent || finalResponse !== previousResponse)
        ) {
          return finalResponse;
        }
        if (hasNewAgentEvent && status === "finished") {
          return "The agent finished without a text response.";
        }
      }

      await sleep(pollIntervalMs);
    }

    const link = conversationLink(publicUrl, conversationId);
    return [
      "The agent is still working. Use /status to check it later.",
      ...(link ? [link] : []),
    ].join("\n");
  };

  const createConversation = async (chatId, prompt = "") => {
    const conversation = await agent.createConversation({
      prompt,
      profileId,
      workingDir,
      chatId,
    });
    await state.setConversationId(chatId, conversation.id);
    if (!prompt) {
      await send(chatId, `Started a new conversation.\nID: ${conversation.id}`);
      return;
    }
    await send(chatId, `Started: ${conversation.title || conversation.id}`);
    await send(chatId, await waitForResponse(chatId, conversation.id));
  };

  const continueConversation = async (chatId, text) => {
    let conversationId = state.getConversationId(chatId);
    if (!conversationId) {
      await createConversation(chatId, text);
      return;
    }

    const [previousResponse, previousEventCount] = await Promise.all([
      agent.getFinalResponse(conversationId),
      agent.getEventCount(conversationId),
    ]);
    await agent.sendMessage(conversationId, text);
    await send(
      chatId,
      await waitForResponse(
        chatId,
        conversationId,
        previousResponse,
        previousEventCount,
      ),
    );
  };

  return async function handleUpdate(update) {
    const message = update?.message;
    const chatId = message?.chat?.id;
    const userId = message?.from?.id;
    const text = message?.text?.trim();
    if (!chatId || !userId || !text) return;

    const command = parseCommand(text);
    if (command?.name === "whoami") {
      await send(chatId, `Your Telegram user ID is ${userId}.`);
      return;
    }

    if (message.chat.type !== "private") {
      await send(
        chatId,
        "For safety, GrokBot only accepts messages in a private chat.",
      );
      return;
    }

    if (allowedUserIds.size === 0) {
      await send(
        chatId,
        `GrokBot is in setup mode. Your Telegram user ID is ${userId}. Add it to TELEGRAM_ALLOWED_USER_IDS and restart the deployment.`,
      );
      return;
    }

    if (!allowedUserIds.has(String(userId))) {
      logger.warn(`[telegram-bridge] Ignored unauthorized user ${userId}`);
      return;
    }

    try {
      if (!command) {
        await continueConversation(chatId, text);
        return;
      }

      if (command.name === "start" || command.name === "help") {
        await send(chatId, HELP_TEXT);
        return;
      }

      if (command.name === "new") {
        await createConversation(chatId, command.argument);
        return;
      }

      if (command.name === "latest") {
        const conversation = await agent.getLatestConversation();
        if (!conversation) {
          await send(
            chatId,
            "No GrokBot conversations exist yet. Send a task to start one.",
          );
          return;
        }
        await state.setConversationId(chatId, conversation.id);
        await send(
          chatId,
          `Attached to:\n${statusMessage(conversation, publicUrl)}`,
        );
        return;
      }

      if (command.name === "use") {
        if (!command.argument) {
          await send(chatId, "Usage: /use <conversation-id>");
          return;
        }
        const conversation = await agent.getConversation(command.argument);
        await state.setConversationId(chatId, conversation.id);
        await send(
          chatId,
          `Attached to:\n${statusMessage(conversation, publicUrl)}`,
        );
        return;
      }

      if (command.name === "status") {
        const conversationId = state.getConversationId(chatId);
        if (!conversationId) {
          await send(
            chatId,
            "No conversation is attached. Send a task or use /latest.",
          );
          return;
        }
        const conversation = await agent.getConversation(conversationId);
        await send(chatId, statusMessage(conversation, publicUrl));
        if (TERMINAL_STATUSES.has(conversation.execution_status)) {
          const finalResponse = await agent.getFinalResponse(conversationId);
          if (finalResponse) await send(chatId, finalResponse);
        }
        return;
      }

      if (command.name === "stop") {
        const conversationId = state.getConversationId(chatId);
        if (!conversationId) {
          await send(chatId, "No conversation is attached.");
          return;
        }
        await agent.interrupt(conversationId);
        await send(chatId, "Interrupt requested.");
        return;
      }

      await send(chatId, `Unknown command /${command.name}. Use /help.`);
    } catch (error) {
      logger.error("[telegram-bridge] Update failed", error);
      await send(
        chatId,
        `GrokBot error: ${error instanceof Error ? error.message : error}`,
      );
    }
  };
}

function enqueueByChat(queues, chatId, task, logger) {
  const previous = queues.get(chatId) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(task)
    .catch((error) =>
      logger.error("[telegram-bridge] Queued update failed", error),
    )
    .finally(() => {
      if (queues.get(chatId) === next) queues.delete(chatId);
    });
  queues.set(chatId, next);
}

export async function runTelegramBridge({
  env = process.env,
  logger = console,
} = {}) {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required");

  const apiKey = (
    env.GROKBOT_AGENT_SERVER_API_KEY ||
    env.OH_SESSION_API_KEYS_0 ||
    env.LOCAL_BACKEND_API_KEY ||
    ""
  ).trim();
  if (!apiKey) throw new Error("GrokBot Agent Server API key is required");

  const telegram = new TelegramApi({ token });
  const agent = new AgentServerApi({
    baseUrl: env.GROKBOT_AGENT_SERVER_URL || "http://127.0.0.1:18000",
    apiKey,
  });
  const state = new JsonBridgeState(
    env.TELEGRAM_STATE_PATH ||
      "/home/openhands/.openhands/agent-canvas/telegram-bridge.json",
  );
  await state.load();

  const allowedUserIds = parseAllowedUserIds(env.TELEGRAM_ALLOWED_USER_IDS);
  const handleUpdate = createTelegramUpdateHandler({
    telegram,
    agent,
    state,
    allowedUserIds,
    profileId: env.TELEGRAM_AGENT_PROFILE_ID?.trim(),
    workingDir: env.TELEGRAM_WORKING_DIR || "/projects/Grokbot",
    publicUrl: env.TELEGRAM_GROKBOT_URL || "",
    responseTimeoutMs:
      Number(env.TELEGRAM_RESPONSE_TIMEOUT_SECONDS || 1800) * 1000,
    logger,
  });

  const bot = await telegram.getMe();
  logger.log(`[telegram-bridge] Connected as @${bot.username || bot.id}`);
  if (allowedUserIds.size === 0) {
    logger.warn(
      "[telegram-bridge] TELEGRAM_ALLOWED_USER_IDS is empty; setup mode only. Send /whoami, then configure the returned ID.",
    );
  }

  const queues = new Map();
  const pollTimeout = Math.max(
    1,
    Math.min(50, Number(env.TELEGRAM_POLL_TIMEOUT_SECONDS || 25)),
  );
  let offset = 0;
  let retryDelayMs = 1000;

  for (;;) {
    try {
      const updates = await telegram.getUpdates(offset, pollTimeout);
      for (const update of updates) {
        offset = Math.max(offset, update.update_id + 1);
        const chatId = update?.message?.chat?.id;
        if (!chatId) continue;
        enqueueByChat(
          queues,
          String(chatId),
          () => handleUpdate(update),
          logger,
        );
      }
      retryDelayMs = 1000;
    } catch (error) {
      logger.error("[telegram-bridge] Poll failed", error);
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      retryDelayMs = Math.min(retryDelayMs * 2, 30_000);
    }
  }
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  runTelegramBridge().catch((error) => {
    console.error("[telegram-bridge] Fatal error", error);
    process.exitCode = 1;
  });
}

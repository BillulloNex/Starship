import assert from "node:assert/strict";
import test from "node:test";

import {
  AgentServerApi,
  createTelegramUpdateHandler,
  parseAllowedUserIds,
  parseCommand,
  splitTelegramMessage,
} from "./telegram-bridge.mjs";

test("parseCommand accepts Telegram-addressed commands and arguments", () => {
  assert.deepEqual(parseCommand("/new@GrokBot_bot fix the login"), {
    name: "new",
    argument: "fix the login",
  });
  assert.equal(parseCommand("ordinary message"), null);
});

test("parseAllowedUserIds ignores malformed values", () => {
  assert.deepEqual(
    [...parseAllowedUserIds(" 123,abc,456,-7 ")],
    ["123", "456"],
  );
});

test("splitTelegramMessage keeps every chunk within Telegram's limit", () => {
  const chunks = splitTelegramMessage(
    `${"a".repeat(2500)}\n${"b".repeat(2500)}`,
    3000,
  );
  assert.equal(chunks.length, 2);
  assert.ok(chunks.every((chunk) => chunk.length <= 3000));
  assert.equal(chunks.join(""), `${"a".repeat(2500)}${"b".repeat(2500)}`);
});

test("AgentServerApi starts a tagged conversation with the active profile", async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    const body = url.endsWith("/api/agent-profiles")
      ? { active_agent_profile_id: "profile-1", profiles: [] }
      : { id: "conversation-1", execution_status: "running" };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const agent = new AgentServerApi({
    baseUrl: "http://agent-server:18000",
    apiKey: "session-key",
    fetchImpl,
  });

  await agent.createConversation({
    prompt: "Fix it",
    profileId: "",
    workingDir: "/projects/Grokbot",
    chatId: 99,
  });

  assert.equal(requests.length, 2);
  assert.equal(requests[1].options.headers["X-Session-API-Key"], "session-key");
  const payload = JSON.parse(requests[1].options.body);
  assert.equal(payload.agent_profile_id, "profile-1");
  assert.deepEqual(payload.workspace, {
    kind: "LocalWorkspace",
    working_dir: "/projects/Grokbot",
  });
  assert.equal(payload.initial_message.content[0].text, "Fix it");
  assert.deepEqual(payload.tags, { channel: "telegram", telegramchat: "99" });
});

function createHarness({ allowedUserIds = new Set(["42"]) } = {}) {
  const sent = [];
  let conversationId = null;
  const telegram = {
    sendMessage: async (chatId, text) => sent.push({ chatId, text }),
    sendTyping: async () => undefined,
  };
  const agent = {
    createConversation: async ({ prompt }) => ({
      id: "conversation-1",
      title: prompt ? "Mobile task" : null,
    }),
    getConversation: async (id) => ({
      id,
      title: "Mobile task",
      execution_status: "finished",
    }),
    getFinalResponse: async () => "Done from GrokBot",
    getEventCount: async () => 2,
    getLatestConversation: async () => ({
      id: "latest-1",
      title: "Latest task",
      execution_status: "idle",
    }),
    sendMessage: async () => undefined,
    interrupt: async () => undefined,
  };
  const state = {
    getConversationId: () => conversationId,
    setConversationId: async (_chatId, nextId) => {
      conversationId = nextId;
    },
  };
  const handler = createTelegramUpdateHandler({
    telegram,
    agent,
    state,
    allowedUserIds,
    sleep: async () => undefined,
    now: (() => {
      let value = 0;
      return () => (value += 1000);
    })(),
    logger: { error() {}, warn() {} },
  });
  const update = (text, userId = 42) => ({
    update_id: 1,
    message: {
      text,
      from: { id: userId },
      chat: { id: 99, type: "private" },
    },
  });
  return {
    agent,
    handler,
    sent,
    update,
    getConversationId: () => conversationId,
  };
}

test("an authorized first message creates a conversation and returns the agent reply", async () => {
  const harness = createHarness();

  await harness.handler(harness.update("Fix the mobile layout"));

  assert.equal(harness.getConversationId(), "conversation-1");
  assert.deepEqual(
    harness.sent.map((entry) => entry.text),
    ["Started: Mobile task", "Done from GrokBot"],
  );
});

test("a continued conversation returns a repeated reply after new agent events", async () => {
  const harness = createHarness();
  await harness.handler(harness.update("/latest"));
  let eventCountCalls = 0;
  harness.agent.getEventCount = async () => (eventCountCalls++ === 0 ? 2 : 4);

  await harness.handler(harness.update("Repeat the last answer"));

  assert.equal(harness.sent.at(-1).text, "Done from GrokBot");
});

test("an unauthorized user cannot call the Agent Server", async () => {
  const harness = createHarness();
  let createCalls = 0;
  harness.agent.createConversation = async () => {
    createCalls += 1;
  };

  await harness.handler(harness.update("Run a command", 7));

  assert.equal(createCalls, 0);
  assert.equal(harness.sent.length, 0);
});

test("setup mode reveals only the sender ID", async () => {
  const harness = createHarness({ allowedUserIds: new Set() });

  await harness.handler(harness.update("hello"));

  assert.match(harness.sent[0].text, /user ID is 42/);
  assert.equal(harness.getConversationId(), null);
});

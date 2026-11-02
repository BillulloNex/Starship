import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import {
  PROBE_CONVERSATION_ID,
  createAgentServerWatchdog,
  createTelegramNotifier,
  probeAgentServer,
} from "./agent-server-watchdog.mjs";

function silentLogger() {
  const lines = { log: [], warn: [], error: [] };
  return {
    lines,
    log: (line) => lines.log.push(line),
    warn: (line) => lines.warn.push(line),
    error: (line) => lines.error.push(line),
  };
}

async function withServer(handler, fn) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

test("probe sends the session key and treats the expected 404 as healthy", async () => {
  await withServer(
    (req, res) => {
      assert.equal(
        req.url,
        `/api/conversations/${PROBE_CONVERSATION_ID}/events/count`,
      );
      assert.equal(req.headers["x-session-api-key"], "key");
      res.writeHead(404).end("{}");
    },
    async (url) => {
      const result = await probeAgentServer({
        agentServerUrl: `${url}/`,
        apiKey: "key",
      });
      assert.equal(result.ok, true);
    },
  );
});

test("probe fails when the agent-server never answers", async () => {
  await withServer(
    () => {
      // Hold the request open, like a wedged lifecycle lock.
    },
    async (url) => {
      const result = await probeAgentServer({
        agentServerUrl: url,
        apiKey: "key",
        timeoutMs: 100,
      });
      assert.equal(result.ok, false);
      assert.match(result.error, /no response within/);
    },
  );
});

test("probe fails on a 5xx answer", async () => {
  await withServer(
    (req, res) => res.writeHead(502).end(),
    async (url) => {
      const result = await probeAgentServer({
        agentServerUrl: url,
        apiKey: "key",
      });
      assert.deepEqual([result.ok, result.error], [false, "HTTP 502"]);
    },
  );
});

test("watchdog alerts once after consecutive failures, then once on recovery", async () => {
  const statuses = [502, 502, 502, 502, 404, 404];
  const sent = [];
  const logger = silentLogger();
  const watchdog = createAgentServerWatchdog({
    agentServerUrl: "http://agent",
    apiKey: "key",
    failuresBeforeAlert: 3,
    notify: async (message) => sent.push(message),
    fetchImpl: async () => new Response("", { status: statuses.shift() }),
    logger,
  });

  for (let i = 0; i < 4; i += 1) await watchdog.check();
  assert.equal(sent.length, 1);
  assert.match(sent[0], /chats are stuck/);
  assert.equal(logger.lines.error.length, 1);

  await watchdog.check();
  await watchdog.check();
  assert.equal(sent.length, 2);
  assert.match(sent[1], /responding again/);
});

test("watchdog stays quiet through a blip shorter than the threshold", async () => {
  const statuses = [502, 404, 502, 502, 404];
  const sent = [];
  const watchdog = createAgentServerWatchdog({
    agentServerUrl: "http://agent",
    apiKey: "key",
    failuresBeforeAlert: 3,
    notify: async (message) => sent.push(message),
    fetchImpl: async () => new Response("", { status: statuses.shift() }),
    logger: silentLogger(),
  });

  for (let i = 0; i < 5; i += 1) await watchdog.check();
  assert.deepEqual(sent, []);
});

test("a failing alert channel does not break the watchdog", async () => {
  const logger = silentLogger();
  const watchdog = createAgentServerWatchdog({
    agentServerUrl: "http://agent",
    apiKey: "key",
    failuresBeforeAlert: 1,
    notify: async () => {
      throw new Error("telegram down");
    },
    fetchImpl: async () => new Response("", { status: 503 }),
    logger,
  });

  const result = await watchdog.check();
  assert.equal(result.ok, false);
  assert.match(logger.lines.warn[0], /telegram down/);
});

test("telegram notifier is off without a token or allowed users", () => {
  assert.equal(createTelegramNotifier({ token: "", userIds: "1" }), null);
  assert.equal(createTelegramNotifier({ token: "t", userIds: "" }), null);
});

test("telegram notifier messages every allowed user", async () => {
  const chats = [];
  const notify = createTelegramNotifier({
    token: "t",
    userIds: "11,22",
    fetchImpl: async (url, init) => {
      chats.push(JSON.parse(init.body).chat_id);
      return new Response(JSON.stringify({ ok: true, result: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });
  await notify("hello");
  assert.deepEqual(chats.sort(), ["11", "22"]);
});

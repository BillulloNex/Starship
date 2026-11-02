/**
 * Agent-server conversation watchdog.
 *
 * `/health` stayed 200 for 13 hours on 2026-11-02 while every chat hung: a
 * conversation close had wedged the agent-server's global lifecycle lock, and
 * `/health` never touches it. This probes the path real work takes instead —
 * an events read for a conversation id that cannot exist. The agent-server
 * takes the lifecycle lock, finds no record and answers 404 in milliseconds;
 * while the lock is held it never answers at all.
 *
 * After a few failed probes in a row it alerts once (log line + Telegram, when
 * the bot is configured), and once more when chats recover.
 */

import process from "node:process";

import { TelegramApi, parseAllowedUserIds } from "./telegram-bridge.mjs";

export const PROBE_CONVERSATION_ID = "00000000-0000-4000-8000-000000000000";

export async function probeAgentServer({
  agentServerUrl,
  apiKey,
  timeoutMs = 10_000,
  fetchImpl = fetch,
}) {
  const url = `${agentServerUrl.replace(/\/+$/, "")}/api/conversations/${PROBE_CONVERSATION_ID}/events/count`;
  const startedAt = Date.now();
  try {
    const response = await fetchImpl(url, {
      headers: { "X-Session-API-Key": apiKey },
      signal: AbortSignal.timeout(timeoutMs),
    });
    await response.text().catch(() => "");
    // Any answer below 500 means the lock was free: 404 is the expected one.
    const ok = response.status < 500;
    return {
      ok,
      durationMs: Date.now() - startedAt,
      error: ok ? null : `HTTP ${response.status}`,
    };
  } catch (err) {
    const timedOut = err?.name === "TimeoutError" || err?.name === "AbortError";
    return {
      ok: false,
      durationMs: Date.now() - startedAt,
      error: timedOut
        ? `no response within ${Math.round(timeoutMs / 1000)}s`
        : err?.message || String(err),
    };
  }
}

function formatDuration(ms) {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "under a minute";
  if (minutes < 120) return `${minutes} min`;
  return `${Math.round(minutes / 60)} h`;
}

export function createAgentServerWatchdog({
  agentServerUrl,
  apiKey,
  notify = null,
  timeoutMs = 10_000,
  failuresBeforeAlert = 3,
  fetchImpl = fetch,
  logger = console,
  now = Date.now,
}) {
  let consecutiveFailures = 0;
  let downSince = null;
  let alerted = false;
  let inFlight = false;

  async function send(message) {
    if (!notify) return;
    try {
      await notify(message);
    } catch (err) {
      logger.warn(
        `[agent-server-watchdog] alert delivery failed: ${err.message}`,
      );
    }
  }

  async function check() {
    // A wedged server holds each probe for the full timeout; never stack them.
    if (inFlight) return null;
    inFlight = true;
    try {
      const result = await probeAgentServer({
        agentServerUrl,
        apiKey,
        timeoutMs,
        fetchImpl,
      });
      if (result.ok) {
        if (alerted) {
          const message = `Starship chats are responding again (stuck for ${formatDuration(now() - downSince)}).`;
          logger.log(`[agent-server-watchdog] ${message}`);
          await send(message);
        }
        consecutiveFailures = 0;
        downSince = null;
        alerted = false;
        return result;
      }

      consecutiveFailures += 1;
      downSince ??= now() - result.durationMs;
      if (!alerted && consecutiveFailures >= failuresBeforeAlert) {
        alerted = true;
        const message =
          `Starship chats are stuck: conversation health check failed ${consecutiveFailures} times in a row ` +
          `(${result.error}). New chats and old chats will not load, even though /health may look fine. ` +
          "Restarting the container clears it; look for 'close() still running' in the agent-server logs.";
        logger.error(`[agent-server-watchdog] ${message}`);
        await send(message);
      }
      return result;
    } finally {
      inFlight = false;
    }
  }

  return { check };
}

export function createTelegramNotifier({
  token = process.env.TELEGRAM_BOT_TOKEN,
  userIds = process.env.TELEGRAM_ALLOWED_USER_IDS,
  fetchImpl = fetch,
} = {}) {
  const chatIds = [...parseAllowedUserIds(userIds || "")];
  if (!token || chatIds.length === 0) return null;
  const telegram = new TelegramApi({ token, fetchImpl });
  return async (text) => {
    const results = await Promise.allSettled(
      chatIds.map((chatId) => telegram.sendMessage(chatId, text)),
    );
    const failed = results.find((result) => result.status === "rejected");
    if (failed) throw failed.reason;
  };
}

export function startAgentServerWatchdog({
  agentServerUrl,
  apiKey,
  intervalMs = 60_000,
  ...options
} = {}) {
  if (!agentServerUrl || !apiKey) return () => {};
  const watchdog = createAgentServerWatchdog({
    agentServerUrl,
    apiKey,
    notify: createTelegramNotifier(),
    ...options,
  });
  const timer = setInterval(() => {
    watchdog.check().catch((err) => {
      console.error("[agent-server-watchdog] check error:", err.message);
    });
  }, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

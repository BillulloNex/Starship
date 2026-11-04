#!/usr/bin/env node
// Browser Run cookie vault — keeps the agent's logins across Cloudflare
// Browser Run sessions.
//
// Browser Run browsers are disposable: they close after the keep_alive idle
// window and whenever Cloudflare rolls out a release, and every new session
// starts with an empty cookie jar. This module sits between chrome-devtools-mcp
// and Browser Run as a local CDP WebSocket proxy:
//
//   chrome-devtools-mcp ──ws://127.0.0.1:N──▶ proxy ──wss──▶ Browser Run
//
// * When chrome-devtools-mcp connects (or reconnects after a session died) the
//   proxy rejoins the live session, or creates a new one and loads every saved
//   cookie into it before forwarding a single client message.
// * A few seconds after browser activity, and before the client disconnects or
//   sends Browser.close, it reads the browser's cookies and merges the changes
//   into an encrypted vault on the durable /home/openhands/.openhands mount.
//   The merge is three-way (what this session started with vs. what it has
//   now), so two conversations logging into different sites never overwrite
//   each other, and a logout in one removes that cookie for everyone.
//
// Usage:
//   browser-run-vault.mjs mcp [chrome-devtools-mcp args...]   (cf-browser-mcp)
//   cf-browser-vault list            domains in the vault (never values)
//   cf-browser-vault clear [domain]  forget every cookie, or one site's
//   cf-browser-vault path            print the vault directory
//
// Environment:
//   CF_ACCOUNT_ID, CF_BROWSER_API_TOKEN  Browser Run credentials (mcp only)
//   BROWSER_VAULT_DIR    vault directory (default
//                        $OH_PERSISTENCE_DIR/agent-canvas/browser-vault)
//   BROWSER_VAULT_KEY    encryption secret; without it a random key is kept in
//                        vault.key beside the vault (mode 0600)
//   CF_BROWSER_KEEP_ALIVE_MS  Browser Run idle timeout (default 600000)

import { spawn } from "node:child_process";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { realpathSync } from "node:fs";
import fsp from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { WebSocket, WebSocketServer } from "ws";

export const DEFAULT_API_BASE = "https://api.cloudflare.com/client/v4";
export const DEFAULT_KEEP_ALIVE_MS = 600_000;
export const MAX_COOKIES = 10_000;
const VAULT_FILE = "cookies.vault";
const KEY_FILE = "vault.key";
const LOCK_DIR = ".lock";
const LOCK_STALE_MS = 15_000;
const LOCK_WAIT_MS = 10_000;
const CDP_TIMEOUT_MS = 15_000;
// Proxy-issued CDP ids live far above anything chrome-devtools-mcp reaches
// (puppeteer counts up from 1) and stay inside int32, which Chrome requires.
const PROXY_ID_FLOOR = 2_000_000_000;
const PROXY_ID_CEIL = 2_147_000_000;

const stderrLogger = {
  log: (line) => process.stderr.write(`${line}\n`),
  warn: (line) => process.stderr.write(`${line}\n`),
  error: (line) => process.stderr.write(`${line}\n`),
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const shortId = (id) => String(id ?? "").slice(0, 8);

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
      timer.unref?.();
    }),
  ]).finally(() => clearTimeout(timer));
}

// ─────────────────────────────────────────────────────────────────────────────
// Cookies
// ─────────────────────────────────────────────────────────────────────────────

function partitionKeyString(cookie) {
  const key = cookie.partitionKey;
  if (key == null) return "";
  return typeof key === "string" ? key : JSON.stringify(key);
}

export function cookieKey(cookie) {
  return [
    cookie.name,
    String(cookie.domain ?? "").toLowerCase(),
    cookie.path || "/",
    partitionKeyString(cookie),
  ].join("\u0000");
}

export function isExpired(cookie, nowSec = Date.now() / 1000) {
  return (
    !cookie.session &&
    typeof cookie.expires === "number" &&
    cookie.expires > 0 &&
    cookie.expires <= nowSec
  );
}

/**
 * Network.Cookie (from Storage.getCookies) → Network.CookieParam (for
 * Storage.setCookies). Host-only cookies are set by URL rather than domain:
 * passing a domain would turn them into domain cookies, and Chrome rejects a
 * `__Host-` cookie that carries one.
 */
export function toCookieParam(cookie) {
  const cookiePath = cookie.path || "/";
  const domain = String(cookie.domain ?? "");
  const param = { name: cookie.name, value: cookie.value ?? "" };
  if (domain.startsWith(".")) {
    param.domain = domain;
  } else {
    // The URL also fixes the cookie's source scheme and port, which Chrome
    // binds cookies to, so set it from where the cookie originally came from.
    const secure = cookie.secure || cookie.sourceScheme === "Secure";
    const scheme = secure ? "https" : "http";
    const port = Number(cookie.sourcePort);
    const defaultPort = secure ? 443 : 80;
    const host =
      port > 0 && port !== defaultPort ? `${domain}:${port}` : domain;
    param.url = `${scheme}://${host}${cookiePath}`;
  }
  param.path = cookiePath;
  if (cookie.secure) param.secure = true;
  if (cookie.httpOnly) param.httpOnly = true;
  if (cookie.sameSite) param.sameSite = cookie.sameSite;
  if (cookie.priority) param.priority = cookie.priority;
  if (
    !cookie.session &&
    typeof cookie.expires === "number" &&
    cookie.expires > 0
  ) {
    param.expires = cookie.expires;
  }
  if (cookie.partitionKey != null) param.partitionKey = cookie.partitionKey;
  return param;
}

/** The fields worth keeping: what toCookieParam reads, plus `session`. */
function storedCookie(cookie, savedAt) {
  const out = {
    name: cookie.name,
    value: cookie.value ?? "",
    domain: cookie.domain,
    path: cookie.path || "/",
    expires: typeof cookie.expires === "number" ? cookie.expires : -1,
    session: Boolean(cookie.session),
    secure: Boolean(cookie.secure),
    httpOnly: Boolean(cookie.httpOnly),
  };
  if (cookie.sameSite) out.sameSite = cookie.sameSite;
  if (cookie.priority) out.priority = cookie.priority;
  if (cookie.sourceScheme) out.sourceScheme = cookie.sourceScheme;
  if (typeof cookie.sourcePort === "number") out.sourcePort = cookie.sourcePort;
  if (cookie.partitionKey != null) out.partitionKey = cookie.partitionKey;
  out.savedAt = savedAt;
  return out;
}

const fingerprint = (cookie) => JSON.stringify(toCookieParam(cookie));

export function cookieMap(cookies) {
  return new Map((cookies ?? []).map((cookie) => [cookieKey(cookie), cookie]));
}

/** What changed in a browser between `base` and `current` (both Maps). */
export function diffCookies(base, current) {
  const upserts = [];
  const deletes = [];
  for (const [key, cookie] of current) {
    const before = base.get(key);
    if (!before || fingerprint(before) !== fingerprint(cookie)) {
      upserts.push(cookie);
    }
  }
  for (const key of base.keys()) {
    if (!current.has(key)) deletes.push(key);
  }
  return { upserts, deletes };
}

export function pruneCookies(cookies, nowMs = Date.now()) {
  const nowSec = nowMs / 1000;
  let kept = cookies.filter((cookie) => !isExpired(cookie, nowSec));
  if (kept.length > MAX_COOKIES) {
    kept = kept
      .sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0))
      .slice(0, MAX_COOKIES);
  }
  return kept;
}

/** Apply one session's diff to the vault, leaving everyone else's cookies. */
export function applyDiff(
  vaultCookies,
  { upserts, deletes },
  nowMs = Date.now(),
) {
  const merged = cookieMap(vaultCookies);
  for (const key of deletes) merged.delete(key);
  for (const cookie of upserts) {
    merged.set(cookieKey(cookie), storedCookie(cookie, nowMs));
  }
  return pruneCookies([...merged.values()], nowMs);
}

export function cookieMatchesDomain(cookieDomain, target) {
  const domain = String(cookieDomain ?? "")
    .replace(/^\./, "")
    .toLowerCase();
  const wanted = String(target ?? "")
    .replace(/^\./, "")
    .toLowerCase();
  return domain === wanted || domain.endsWith(`.${wanted}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Vault storage (AES-256-GCM, atomic writes, cross-process lock)
// ─────────────────────────────────────────────────────────────────────────────

export function deriveKey(secret) {
  return createHash("sha256")
    .update("starship-browser-vault:v1:")
    .update(String(secret))
    .digest();
}

export function encryptVault(payload, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  return `${JSON.stringify({
    v: 1,
    alg: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  })}\n`;
}

export function decryptVault(text, key) {
  const envelope = JSON.parse(text);
  if (envelope?.v !== 1 || envelope.alg !== "aes-256-gcm") {
    throw new Error("unsupported vault format");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(envelope.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(envelope.data, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(plain.toString("utf8"));
}

export function resolveVaultDir(env = process.env) {
  if (env.BROWSER_VAULT_DIR) return env.BROWSER_VAULT_DIR;
  const root =
    env.OH_PERSISTENCE_DIR || path.join(env.HOME || os.homedir(), ".openhands");
  return path.join(root, "agent-canvas", "browser-vault");
}

const emptyVault = () => ({ version: 1, updatedAt: null, cookies: [] });

export function createVaultStore({ dir, secret, logger = stderrLogger }) {
  const file = path.join(dir, VAULT_FILE);
  const keyFile = path.join(dir, KEY_FILE);
  const lockDir = path.join(dir, LOCK_DIR);
  let fileKey = null;

  async function ensureDir() {
    await fsp.mkdir(dir, { recursive: true, mode: 0o700 });
  }

  // `docker exec` runs as root; files it writes must stay readable by the
  // openhands user that owns the vault directory and runs the MCP server.
  async function matchDirOwner(target) {
    if (typeof process.getuid !== "function" || process.getuid() !== 0) return;
    const owner = await fsp.stat(dir).catch(() => null);
    if (owner && owner.uid !== 0) {
      await fsp.chown(target, owner.uid, owner.gid).catch(() => {});
    }
  }

  async function readKeyFile() {
    const text = await fsp.readFile(keyFile, "utf8");
    const key = Buffer.from(text.trim(), "base64");
    if (key.length !== 32) throw new Error(`${keyFile} is not a 32-byte key`);
    return key;
  }

  async function loadFileKey({ create }) {
    if (fileKey) return fileKey;
    try {
      fileKey = await readKeyFile();
      return fileKey;
    } catch (error) {
      if (error.code !== "ENOENT" || !create) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
    }
    await ensureDir();
    const fresh = randomBytes(32);
    try {
      await fsp.writeFile(keyFile, `${fresh.toString("base64")}\n`, {
        mode: 0o600,
        flag: "wx",
      });
      await matchDirOwner(keyFile);
      fileKey = fresh;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      fileKey = await readKeyFile();
    }
    return fileKey;
  }

  async function writeKey() {
    return secret ? deriveKey(secret) : loadFileKey({ create: true });
  }

  /** Every key that may have written the current file, newest first. */
  async function readKeys() {
    const keys = [];
    if (secret) keys.push(deriveKey(secret));
    const fromFile = await loadFileKey({ create: false }).catch(() => null);
    if (fromFile) keys.push(fromFile);
    return keys;
  }

  async function read() {
    let text;
    try {
      text = await fsp.readFile(file, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return emptyVault();
      throw error;
    }
    let lastError = new Error("no key available");
    for (const key of await readKeys()) {
      try {
        const vault = decryptVault(text, key);
        return {
          version: 1,
          updatedAt: vault.updatedAt ?? null,
          cookies: Array.isArray(vault.cookies) ? vault.cookies : [],
        };
      } catch (error) {
        lastError = error;
      }
    }
    // Never silently overwrite a vault we cannot open (wrong key, corruption):
    // move it aside so it can be recovered, and start empty.
    const aside = `${file}.unreadable-${Date.now()}`;
    await fsp.rename(file, aside).catch(() => {});
    logger.warn(
      `[browser-vault] could not open ${file} (${lastError.message}); ` +
        `moved it to ${aside} and started an empty vault`,
    );
    return emptyVault();
  }

  async function write(vault) {
    await ensureDir();
    const tmp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
    await fsp.writeFile(tmp, encryptVault(vault, await writeKey()), {
      mode: 0o600,
    });
    await matchDirOwner(tmp);
    await fsp.rename(tmp, file);
  }

  async function withLock(fn) {
    await ensureDir();
    const deadline = Date.now() + LOCK_WAIT_MS;
    for (;;) {
      try {
        await fsp.mkdir(lockDir);
        break;
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        const stat = await fsp.stat(lockDir).catch(() => null);
        if (stat && Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
          await fsp.rm(lockDir, { recursive: true, force: true });
          continue;
        }
        if (Date.now() > deadline) throw new Error("browser vault is locked");
        await sleep(20 + Math.random() * 40);
      }
    }
    try {
      return await fn();
    } finally {
      await fsp.rm(lockDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  return {
    dir,
    file,
    load: () => read(),
    /** Read-modify-write under the lock; `mutate(cookies)` returns cookies. */
    update: (mutate) =>
      withLock(async () => {
        const current = await read();
        const next = {
          version: 1,
          updatedAt: new Date().toISOString(),
          cookies: mutate(current.cookies),
        };
        await write(next);
        return next;
      }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Browser Run REST client
// ─────────────────────────────────────────────────────────────────────────────

export function createBrowserRunClient({
  accountId,
  token,
  apiBase = DEFAULT_API_BASE,
  fetchImpl = fetch,
}) {
  const base = `${apiBase.replace(/\/$/, "")}/accounts/${accountId}/browser-run/devtools`;
  const headers = { Authorization: `Bearer ${token}` };
  return {
    headers,
    async createSession(keepAliveMs) {
      const response = await fetchImpl(
        `${base}/browser?keep_alive=${keepAliveMs}`,
        { method: "POST", headers, signal: AbortSignal.timeout(30_000) },
      );
      const text = await response.text();
      if (!response.ok) {
        throw new Error(
          `Browser Run session create failed: HTTP ${response.status} ${text.slice(0, 200)}`,
        );
      }
      const body = JSON.parse(text);
      if (!body?.sessionId) {
        throw new Error("Browser Run session create returned no sessionId");
      }
      return {
        sessionId: body.sessionId,
        wsUrl:
          body.webSocketDebuggerUrl ||
          `${base.replace(/^http/, "ws")}/browser/${body.sessionId}`,
      };
    },
    async deleteSession(sessionId) {
      const response = await fetchImpl(`${base}/browser/${sessionId}`, {
        method: "DELETE",
        headers,
        signal: AbortSignal.timeout(5_000),
      });
      await response.text().catch(() => {});
      return response.ok;
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CDP proxy
// ─────────────────────────────────────────────────────────────────────────────

const RESPONSE_ID = /^\{\s*"id"\s*:\s*(\d+)/;

export async function startVaultProxy({
  client,
  vault,
  keepAliveMs = DEFAULT_KEEP_ALIVE_MS,
  logger = stderrLogger,
  saveDebounceMs = 3_000,
  saveMaxWaitMs = 20_000,
  connectTimeoutMs = 30_000,
}) {
  /** @type {null | {id: string, wsUrl: string, base: Map<string, any>, closed: boolean}} */
  let session = null;
  const conns = new Set();
  let nextId = PROXY_ID_FLOOR;
  let saveChain = Promise.resolve();
  let saveTimer = null;
  let firstPendingAt = 0;
  let lastActivityAt = 0;
  let stopping = false;

  function openWs(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url, {
        headers: client.headers,
        handshakeTimeout: connectTimeoutMs,
        perMessageDeflate: false,
        maxPayload: 512 * 1024 * 1024,
      });
      ws.once("open", () => resolve(ws));
      ws.once("error", reject);
      ws.on("error", () => {});
    });
  }

  function send(ws, data, isBinary) {
    if (ws?.readyState === WebSocket.OPEN) ws.send(data, { binary: isBinary });
  }

  function call(conn, method, params = {}) {
    const id = nextId++;
    if (nextId > PROXY_ID_CEIL) nextId = PROXY_ID_FLOOR;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        conn.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, CDP_TIMEOUT_MS);
      timer.unref?.();
      conn.pending.set(id, {
        resolve: (message) => {
          clearTimeout(timer);
          if (message.error) {
            reject(new Error(message.error.message || `${method} failed`));
          } else {
            resolve(message.result ?? {});
          }
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      if (conn.upstream?.readyState !== WebSocket.OPEN) {
        conn.pending
          .get(id)
          .reject(new Error("Browser Run connection is closed"));
        conn.pending.delete(id);
        return;
      }
      conn.upstream.send(JSON.stringify({ id, method, params }));
    });
  }

  async function readCookies(conn) {
    const result = await call(conn, "Storage.getCookies");
    return result.cookies ?? [];
  }

  async function restore(conn) {
    let saved = [];
    try {
      saved = (await vault.load()).cookies;
    } catch (error) {
      logger.warn(`[browser-vault] could not read the vault: ${error.message}`);
    }
    const nowSec = Date.now() / 1000;
    const params = saved
      .filter((cookie) => !isExpired(cookie, nowSec))
      .map(toCookieParam);
    let rejected = 0;
    if (params.length) {
      try {
        await call(conn, "Storage.setCookies", { cookies: params });
      } catch {
        // One invalid cookie fails the whole batch; set them one at a time.
        for (let i = 0; i < params.length; i += 25) {
          const results = await Promise.allSettled(
            params
              .slice(i, i + 25)
              .map((param) =>
                call(conn, "Storage.setCookies", { cookies: [param] }),
              ),
          );
          rejected += results.filter((r) => r.status === "rejected").length;
        }
      }
    }
    conn.session.base = cookieMap(await readCookies(conn));
    logger.log(
      `[browser-vault] restored ${params.length - rejected} cookies into ` +
        `Browser Run session ${shortId(conn.session.id)}` +
        (rejected ? ` (${rejected} rejected by Chrome)` : ""),
    );
  }

  function pickConn(preferred) {
    const usable = (conn) =>
      conn?.attached &&
      conn.session === session &&
      conn.upstream?.readyState === WebSocket.OPEN;
    if (usable(preferred)) return preferred;
    // A connection whose client already left is about to be closed; only its
    // own disconnect save may still use it.
    for (const conn of conns)
      if (usable(conn) && !conn.clientClosed) return conn;
    return null;
  }

  async function doSave(preferred) {
    const conn = pickConn(preferred);
    if (!conn) return { saved: false };
    const target = conn.session;
    const current = cookieMap(await readCookies(conn));
    const diff = diffCookies(target.base, current);
    if (!diff.upserts.length && !diff.deletes.length) return { saved: false };
    await vault.update((cookies) => applyDiff(cookies, diff));
    target.base = current;
    logger.log(
      `[browser-vault] saved ${diff.upserts.length} new or changed, ` +
        `${diff.deletes.length} removed cookies`,
    );
    return { saved: true, ...diff };
  }

  /** Saves run one at a time, in order. */
  function saveNow(preferred) {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
      firstPendingAt = 0;
    }
    const run = saveChain.then(() => doSave(preferred));
    saveChain = run.catch(() => {});
    return run;
  }

  function onSaveTimer() {
    saveTimer = null;
    const now = Date.now();
    const quietFor = now - lastActivityAt;
    if (quietFor < saveDebounceMs && now - firstPendingAt < saveMaxWaitMs) {
      saveTimer = setTimeout(onSaveTimer, saveDebounceMs - quietFor);
      saveTimer.unref?.();
      return;
    }
    firstPendingAt = 0;
    saveNow().catch((error) =>
      logger.warn(`[browser-vault] save failed: ${error.message}`),
    );
  }

  // Only client traffic schedules a save, so the proxy never keeps an idle
  // Browser Run session awake on its own.
  function noteActivity() {
    const now = Date.now();
    lastActivityAt = now;
    if (!firstPendingAt) firstPendingAt = now;
    if (!saveTimer) {
      saveTimer = setTimeout(onSaveTimer, saveDebounceMs);
      saveTimer.unref?.();
    }
  }

  function flush(conn) {
    conn.ready = true;
    while (conn.ready && conn.queue.length) {
      const [data, isBinary] = conn.queue.shift();
      forwardFromClient(conn, data, isBinary);
    }
  }

  function forwardFromClient(conn, data, isBinary) {
    noteActivity();
    if (!isBinary && data.length < 1024 && data.includes("Browser.close")) {
      let message = null;
      try {
        message = JSON.parse(data.toString());
      } catch {}
      if (message?.method === "Browser.close" && !message.sessionId) {
        // Capture the cookies while the browser still exists.
        conn.ready = false;
        withTimeout(saveNow(conn), 10_000, "save before Browser.close")
          .catch((error) =>
            logger.warn(`[browser-vault] save failed: ${error.message}`),
          )
          .finally(() => {
            if (conn.session) conn.session.closed = true;
            send(conn.upstream, data, isBinary);
            flush(conn);
          });
        return;
      }
    }
    send(conn.upstream, data, isBinary);
  }

  function onUpstreamMessage(conn, data, isBinary) {
    // Only parse while the proxy has its own calls in flight; Chrome writes
    // "id" first, so the cheap prefix match settles almost every message.
    if (!isBinary && conn.pending.size) {
      let id = null;
      let message = null;
      const match = RESPONSE_ID.exec(data.subarray(0, 32).toString());
      if (match) {
        id = Number(match[1]);
      } else if (data.length < 8 * 1024 * 1024) {
        try {
          message = JSON.parse(data.toString());
          if (typeof message?.id === "number" && !message.sessionId)
            id = message.id;
        } catch {}
      }
      const pending = id === null ? null : conn.pending.get(id);
      if (pending) {
        conn.pending.delete(id);
        try {
          pending.resolve(message ?? JSON.parse(data.toString()));
        } catch (error) {
          pending.reject(error);
        }
        return;
      }
    }
    send(conn.clientWs, data, isBinary);
  }

  function bindUpstream(conn, ws, target) {
    conn.upstream = ws;
    conn.session = target;
    ws.on("message", (data, isBinary) =>
      onUpstreamMessage(conn, data, isBinary),
    );
    ws.on("close", () => {
      if (conn.upstream !== ws) return;
      for (const pending of conn.pending.values()) {
        pending.reject(new Error("Browser Run connection closed"));
      }
      conn.pending.clear();
      conns.delete(conn);
      if (conn.attached) conn.clientWs.close();
    });
  }

  async function newSession() {
    const created = await client.createSession(keepAliveMs);
    logger.log(
      `[browser-vault] opened Browser Run session ${shortId(created.sessionId)}`,
    );
    return {
      id: created.sessionId,
      wsUrl: created.wsUrl,
      base: new Map(),
      closed: false,
    };
  }

  async function attachUpstream(conn) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const reuse = Boolean(session && !session.closed);
      if (!reuse) session = await newSession();
      const target = session;
      let ws;
      try {
        ws = await openWs(target.wsUrl);
      } catch (error) {
        if (!reuse) throw error;
        logger.warn(
          `[browser-vault] session ${shortId(target.id)} is gone (${error.message}); starting a new one`,
        );
        target.closed = true;
        continue;
      }
      bindUpstream(conn, ws, target);
      if (!reuse) {
        await restore(conn).catch((error) =>
          logger.warn(`[browser-vault] restore failed: ${error.message}`),
        );
        return;
      }
      try {
        // A dead session can still accept the handshake; prove it answers.
        await call(conn, "Browser.getVersion");
        return;
      } catch (error) {
        conn.upstream = null;
        ws.terminate();
        logger.warn(
          `[browser-vault] session ${shortId(target.id)} did not answer (${error.message}); starting a new one`,
        );
        target.closed = true;
      }
    }
    throw new Error("could not attach to a Browser Run session");
  }

  async function onClientClose(conn) {
    const upstream = conn.upstream;
    if (!conn.attached || upstream?.readyState !== WebSocket.OPEN) return;
    try {
      await withTimeout(saveNow(conn), 10_000, "save on disconnect");
    } catch (error) {
      logger.warn(`[browser-vault] save failed: ${error.message}`);
    }
    upstream.close();
  }

  function handleClient(clientWs) {
    const conn = {
      clientWs,
      upstream: null,
      session: null,
      pending: new Map(),
      queue: [],
      ready: false,
      attached: false,
      clientClosed: false,
    };
    clientWs.on("error", () => {});
    clientWs.on("message", (data, isBinary) => {
      if (!conn.ready) conn.queue.push([data, isBinary]);
      else forwardFromClient(conn, data, isBinary);
    });
    clientWs.on("close", () => {
      conn.clientClosed = true;
      void onClientClose(conn);
    });
    attachUpstream(conn).then(
      () => {
        if (conn.clientClosed || conn.upstream?.readyState !== WebSocket.OPEN) {
          conn.upstream?.close();
          clientWs.close();
          return;
        }
        conn.attached = true;
        conns.add(conn);
        flush(conn);
      },
      (error) => {
        logger.error(
          `[browser-vault] could not open a Browser Run session: ${error.message}`,
        );
        clientWs.close(1011, "Browser Run unavailable");
      },
    );
  }

  // Whoever reaches this socket drives a browser holding every saved login.
  // Loopback alone is not enough: preview hostnames (p{port}.beenex.org)
  // publicly proxy to any container port >= 1024, this one included. So the
  // endpoint path carries a per-process secret, and anything that arrived
  // through a proxy or from a web page is refused outright.
  const secretPath = `/devtools/browser/${randomBytes(24).toString("hex")}`;
  const isTrustedUpgrade = (req) =>
    req.url === secretPath &&
    !req.headers.origin &&
    !req.headers.forwarded &&
    !req.headers["x-forwarded-for"] &&
    !req.headers["x-forwarded-host"] &&
    !req.headers["x-real-ip"];

  const server = createServer((_req, res) => {
    res.writeHead(404).end();
  });
  const wss = new WebSocketServer({
    noServer: true,
    perMessageDeflate: false,
    maxPayload: 512 * 1024 * 1024,
  });
  server.on("upgrade", (req, socket, head) => {
    if (stopping || !isTrustedUpgrade(req)) {
      socket.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => handleClient(ws));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();

  return {
    port,
    wsEndpoint: `ws://127.0.0.1:${port}${secretPath}`,
    get sessionId() {
      return session?.id ?? null;
    },
    saveNow: () => saveNow(),
    /** Final save, then end the Browser Run session so it stops billing. */
    async close({ deleteSession = true } = {}) {
      stopping = true;
      await withTimeout(saveNow(), 10_000, "final save").catch((error) =>
        logger.warn(`[browser-vault] final save failed: ${error.message}`),
      );
      for (const conn of conns) {
        conn.upstream?.close();
        conn.clientWs.close();
      }
      wss.close();
      server.closeAllConnections?.();
      server.close();
      if (deleteSession && session && !session.closed) {
        session.closed = true;
        await client.deleteSession(session.id).catch(() => {});
      }
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

async function runMcp(args, env) {
  const accountId = env.CF_ACCOUNT_ID;
  const token = env.CF_BROWSER_API_TOKEN;
  if (!accountId || !token) {
    stderrLogger.error(
      "ERROR: CF_ACCOUNT_ID and CF_BROWSER_API_TOKEN not available. Check entrypoint.",
    );
    return 1;
  }
  const vault = createVaultStore({
    dir: resolveVaultDir(env),
    secret: env.BROWSER_VAULT_KEY || undefined,
  });
  const client = createBrowserRunClient({
    accountId,
    token,
    apiBase: env.CF_BROWSER_API_BASE || DEFAULT_API_BASE,
  });
  const proxy = await startVaultProxy({
    client,
    vault,
    keepAliveMs: Number(env.CF_BROWSER_KEEP_ALIVE_MS) || DEFAULT_KEEP_ALIVE_MS,
  });

  // chrome-devtools-mcp talks only to the local proxy, so it never needs the
  // Browser Run token or the vault key.
  const childEnv = { ...env };
  delete childEnv.CF_BROWSER_API_TOKEN;
  delete childEnv.BROWSER_VAULT_KEY;
  const child = spawn(
    env.CF_BROWSER_MCP_BIN || "chrome-devtools-mcp",
    [`--wsEndpoint=${proxy.wsEndpoint}`, ...args],
    { stdio: "inherit", env: childEnv },
  );

  for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) {
    process.on(signal, () => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill(signal);
        setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
      }
    });
  }

  return new Promise((resolve) => {
    let done = false;
    const finish = async (code) => {
      if (done) return;
      done = true;
      await proxy.close();
      resolve(code);
    };
    child.on("error", (error) => {
      stderrLogger.error(
        `[browser-vault] could not start chrome-devtools-mcp: ${error.message}`,
      );
      void finish(1);
    });
    child.on("exit", (code, signal) => void finish(code ?? (signal ? 1 : 0)));
  });
}

async function runList(env) {
  const vault = createVaultStore({
    dir: resolveVaultDir(env),
    secret: env.BROWSER_VAULT_KEY || undefined,
  });
  const { cookies, updatedAt } = await vault.load();
  const live = pruneCookies(cookies);
  const byDomain = new Map();
  for (const cookie of live) {
    const domain = String(cookie.domain ?? "").replace(/^\./, "");
    byDomain.set(domain, (byDomain.get(domain) ?? 0) + 1);
  }
  const rows = [...byDomain.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [domain, count] of rows) {
    process.stdout.write(
      `${domain}\t${count} cookie${count === 1 ? "" : "s"}\n`,
    );
  }
  process.stdout.write(
    `${live.length} cookies across ${rows.length} sites` +
      (updatedAt ? `, last saved ${updatedAt}` : "") +
      ` (${vault.file})\n`,
  );
  return 0;
}

async function runClear(args, env) {
  const vault = createVaultStore({
    dir: resolveVaultDir(env),
    secret: env.BROWSER_VAULT_KEY || undefined,
  });
  const domain = args[0];
  let removed = 0;
  await vault.update((cookies) => {
    const kept = domain
      ? cookies.filter((cookie) => !cookieMatchesDomain(cookie.domain, domain))
      : [];
    removed = cookies.length - kept.length;
    return kept;
  });
  process.stdout.write(
    `Removed ${removed} cookie${removed === 1 ? "" : "s"}` +
      (domain ? ` for ${domain}` : "") +
      ". Browser sessions already open keep them until they close.\n",
  );
  return 0;
}

const USAGE = `Usage:
  cf-browser-vault list            list sites with saved logins (no values)
  cf-browser-vault clear [domain]  forget all saved cookies, or one site's
  cf-browser-vault path            print the vault directory
`;

export async function main(argv = process.argv.slice(2), env = process.env) {
  const [command, ...rest] = argv;
  switch (command) {
    case "mcp":
      return runMcp(rest, env);
    case "list":
      return runList(env);
    case "clear":
      return runClear(rest, env);
    case "path":
      process.stdout.write(`${resolveVaultDir(env)}\n`);
      return 0;
    case undefined:
    case "help":
    case "--help":
    case "-h":
      process.stdout.write(USAGE);
      return command ? 0 : 1;
    default:
      process.stderr.write(`Unknown command: ${command}\n${USAGE}`);
      return 1;
  }
}

function isEntrypoint() {
  if (!process.argv[1]) return false;
  try {
    return (
      import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
    );
  } catch {
    return false;
  }
}

if (isEntrypoint()) {
  main().then(
    (code) => process.exit(code ?? 0),
    (error) => {
      process.stderr.write(`[browser-vault] ${error.stack || error.message}\n`);
      process.exit(1);
    },
  );
}

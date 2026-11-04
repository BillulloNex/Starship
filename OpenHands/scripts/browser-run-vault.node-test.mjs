import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fsp from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";

import {
  applyDiff,
  cookieKey,
  cookieMap,
  cookieMatchesDomain,
  createBrowserRunClient,
  createVaultStore,
  diffCookies,
  startVaultProxy,
  toCookieParam,
} from "./browser-run-vault.mjs";

const SCRIPT = fileURLToPath(
  new URL("./browser-run-vault.mjs", import.meta.url),
);
const TOKEN = "test-token";
const ACCOUNT = "acct";
const hour = () => Math.floor(Date.now() / 1000) + 3600;

const silent = { log() {}, warn() {}, error() {} };

async function tempDir() {
  return fsp.mkdtemp(path.join(os.tmpdir(), "browser-vault-test-"));
}

async function waitFor(check, { timeoutMs = 3000, label = "condition" } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline)
      throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

// ── Fake Browser Run: REST session API + a CDP cookie jar per session ───────

function normalizeCookie(param) {
  const domain = param.domain ?? new URL(param.url).hostname;
  const url = param.url ? new URL(param.url) : null;
  return {
    name: param.name,
    value: param.value,
    domain,
    path: param.path || "/",
    expires: param.expires ?? -1,
    size: param.name.length + param.value.length,
    httpOnly: Boolean(param.httpOnly),
    secure: Boolean(param.secure),
    session: param.expires == null,
    ...(param.sameSite ? { sameSite: param.sameSite } : {}),
    priority: param.priority ?? "Medium",
    sourceScheme: url?.protocol === "http:" ? "NonSecure" : "Secure",
    sourcePort: url?.port
      ? Number(url.port)
      : url?.protocol === "http:"
        ? 80
        : 443,
  };
}

async function startFakeBrowserRun() {
  const sessions = new Map();
  const stats = { created: 0, deleted: [], methods: [] };
  let port = 0;

  function kill(id) {
    const session = sessions.get(id);
    if (!session) return;
    session.alive = false;
    for (const ws of session.sockets) ws.close();
  }

  const server = createServer((req, res) => {
    if (req.headers.authorization !== `Bearer ${TOKEN}`) {
      res.writeHead(401).end();
      return;
    }
    const url = new URL(req.url, "http://fake");
    const match = url.pathname.match(
      /^\/client\/v4\/accounts\/acct\/browser-run\/devtools\/browser(?:\/([^/]+))?$/,
    );
    if (req.method === "POST" && match && !match[1]) {
      const id = `session-${++stats.created}`;
      sessions.set(id, {
        id,
        alive: true,
        cookies: new Map(),
        sockets: new Set(),
        keepAlive: url.searchParams.get("keep_alive"),
      });
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          sessionId: id,
          webSocketDebuggerUrl: `ws://127.0.0.1:${port}/client/v4/accounts/acct/browser-rendering/devtools/browser/${id}`,
        }),
      );
      return;
    }
    if (req.method === "DELETE" && match?.[1]) {
      stats.deleted.push(match[1]);
      kill(match[1]);
      res.end('{"status":"closed"}');
      return;
    }
    res.writeHead(404).end();
  });

  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    const match = req.url.match(/\/devtools\/browser\/([^/?]+)/);
    const session = match && sessions.get(match[1]);
    if (req.headers.authorization !== `Bearer ${TOKEN}` || !session?.alive) {
      socket.end("HTTP/1.1 404 Not Found\r\n\r\n");
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      session.sockets.add(ws);
      ws.on("close", () => session.sockets.delete(ws));
      ws.on("message", (raw) => {
        const message = JSON.parse(raw.toString());
        stats.methods.push(message.method);
        const reply = (body) =>
          ws.send(
            JSON.stringify({
              id: message.id,
              ...(message.sessionId ? { sessionId: message.sessionId } : {}),
              ...body,
            }),
          );
        const params = message.params ?? {};
        switch (message.method) {
          case "Storage.getCookies":
            reply({ result: { cookies: [...session.cookies.values()] } });
            break;
          case "Storage.setCookies": {
            for (const param of params.cookies) {
              const invalid =
                param.name === "bad" ||
                (!param.domain && !param.url) ||
                (param.name.startsWith("__Host-") && param.domain);
              if (invalid) {
                reply({
                  error: { code: -32000, message: "Invalid cookie fields" },
                });
                return;
              }
            }
            for (const param of params.cookies) {
              const cookie = normalizeCookie(param);
              session.cookies.set(cookieKey(cookie), cookie);
            }
            reply({ result: {} });
            break;
          }
          case "Test.pageSetsCookie": {
            const cookie = normalizeCookie(params.cookie);
            session.cookies.set(cookieKey(cookie), cookie);
            reply({ result: {} });
            break;
          }
          case "Test.pageDeletesCookie":
            for (const [key, cookie] of session.cookies) {
              if (cookie.name === params.name) session.cookies.delete(key);
            }
            reply({ result: {} });
            break;
          case "Browser.close":
            reply({ result: {} });
            kill(session.id);
            break;
          default:
            reply({ result: {} });
            ws.send(
              JSON.stringify({
                method: "Target.targetInfoChanged",
                params: {},
              }),
            );
        }
      });
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = server.address().port;
  return {
    apiBase: `http://127.0.0.1:${port}/client/v4`,
    sessions,
    stats,
    kill,
    async close() {
      for (const session of sessions.values()) kill(session.id);
      wss.close();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

function connectCdp(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let id = 0;
    const pending = new Map();
    const events = [];
    ws.on("message", (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.id && pending.has(message.id)) {
        pending.get(message.id)(message);
        pending.delete(message.id);
      } else {
        events.push(message);
      }
    });
    const closed = new Promise((done) => ws.on("close", done));
    ws.on("error", reject);
    ws.on("open", () =>
      resolve({
        ws,
        events,
        closed,
        send(method, params = {}) {
          return new Promise((done) => {
            const callId = ++id;
            pending.set(callId, done);
            ws.send(JSON.stringify({ id: callId, method, params }));
          });
        },
        async close() {
          ws.close();
          await closed;
        },
      }),
    );
  });
}

async function setup(t, proxyOptions = {}) {
  const fake = await startFakeBrowserRun();
  const dir = await tempDir();
  const vault = createVaultStore({ dir, logger: silent });
  const client = createBrowserRunClient({
    accountId: ACCOUNT,
    token: TOKEN,
    apiBase: fake.apiBase,
  });
  const proxy = await startVaultProxy({
    client,
    vault,
    logger: silent,
    saveDebounceMs: 40,
    saveMaxWaitMs: 200,
    ...proxyOptions,
  });
  t.after(async () => {
    await proxy.close({ deleteSession: false });
    await fake.close();
    await fsp.rm(dir, { recursive: true, force: true });
  });
  return { fake, dir, vault, client, proxy };
}

const savedNames = async (vault) =>
  (await vault.load()).cookies.map((cookie) => cookie.name).sort();

// ── Pure cookie logic ───────────────────────────────────────────────────────

test("toCookieParam keeps host-only cookies host-only and drops session expiry", () => {
  const hostOnly = toCookieParam({
    name: "__Host-sid",
    value: "v",
    domain: "app.example.com",
    path: "/",
    secure: true,
    httpOnly: true,
    session: true,
    expires: -1,
    sameSite: "Lax",
    size: 99,
  });
  assert.deepEqual(hostOnly, {
    name: "__Host-sid",
    value: "v",
    url: "https://app.example.com/",
    path: "/",
    secure: true,
    httpOnly: true,
    sameSite: "Lax",
  });

  const expires = hour();
  const domainCookie = toCookieParam({
    name: "pref",
    value: "1",
    domain: ".example.com",
    path: "/docs",
    session: false,
    expires,
  });
  assert.equal(domainCookie.domain, ".example.com");
  assert.equal(domainCookie.url, undefined);
  assert.equal(domainCookie.expires, expires);

  const devServer = toCookieParam({
    name: "dev",
    value: "1",
    domain: "localhost",
    path: "/",
    secure: false,
    sourceScheme: "NonSecure",
    sourcePort: 3000,
    session: true,
  });
  assert.equal(devServer.url, "http://localhost:3000/");
});

test("diff + merge keep other sessions' logins and propagate logouts", () => {
  const now = Date.now();
  const a = {
    name: "a",
    value: "1",
    domain: "a.com",
    path: "/",
    session: true,
  };
  const b = {
    name: "b",
    value: "1",
    domain: "b.com",
    path: "/",
    session: true,
  };
  const c = {
    name: "c",
    value: "1",
    domain: "c.com",
    path: "/",
    session: true,
  };

  // Session 1 started with {a}; meanwhile session 2 saved {b} to the vault.
  const vaultCookies = applyDiff([], { upserts: [a, b], deletes: [] }, now);
  const base = cookieMap([a]);
  // Session 1 logs out of a.com and into c.com.
  const current = cookieMap([c]);
  const diff = diffCookies(base, current);
  assert.deepEqual(diff.deletes, [cookieKey(a)]);
  assert.deepEqual(
    diff.upserts.map((cookie) => cookie.name),
    ["c"],
  );

  const merged = applyDiff(vaultCookies, diff, now);
  assert.deepEqual(merged.map((cookie) => cookie.name).sort(), ["b", "c"]);
});

test("unchanged cookies produce no diff and expired cookies are pruned", () => {
  const live = {
    name: "x",
    value: "1",
    domain: ".x.com",
    path: "/",
    session: false,
    expires: hour(),
  };
  assert.deepEqual(
    diffCookies(cookieMap([live]), cookieMap([{ ...live, size: 3 }])),
    {
      upserts: [],
      deletes: [],
    },
  );
  const stale = {
    ...live,
    name: "old",
    expires: Math.floor(Date.now() / 1000) - 10,
  };
  const merged = applyDiff([stale], { upserts: [live], deletes: [] });
  assert.deepEqual(
    merged.map((cookie) => cookie.name),
    ["x"],
  );
});

test("cookieMatchesDomain matches the site and its subdomains only", () => {
  assert.ok(cookieMatchesDomain(".github.com", "github.com"));
  assert.ok(cookieMatchesDomain("gist.github.com", "github.com"));
  assert.ok(!cookieMatchesDomain("notgithub.com", "github.com"));
});

// ── Vault storage ───────────────────────────────────────────────────────────

test("vault is encrypted at rest with a 0600 key file", async (t) => {
  const dir = await tempDir();
  t.after(() => fsp.rm(dir, { recursive: true, force: true }));
  const vault = createVaultStore({ dir, logger: silent });
  await vault.update(() => [
    {
      name: "sid",
      value: "super-secret-value",
      domain: "a.com",
      path: "/",
      session: true,
    },
  ]);
  const raw = await fsp.readFile(vault.file, "utf8");
  assert.ok(!raw.includes("super-secret-value"));
  assert.ok(!raw.includes("a.com"));
  assert.equal((await fsp.stat(vault.file)).mode & 0o777, 0o600);
  assert.equal(
    (await fsp.stat(path.join(dir, "vault.key"))).mode & 0o777,
    0o600,
  );
  assert.deepEqual(
    await savedNames(createVaultStore({ dir, logger: silent })),
    ["sid"],
  );
});

test("setting BROWSER_VAULT_KEY later still opens a vault written with the key file", async (t) => {
  const dir = await tempDir();
  t.after(() => fsp.rm(dir, { recursive: true, force: true }));
  await createVaultStore({ dir, logger: silent }).update(() => [
    { name: "keep", value: "1", domain: "a.com", path: "/", session: true },
  ]);
  const withSecret = createVaultStore({
    dir,
    secret: "from-coolify",
    logger: silent,
  });
  assert.deepEqual(await savedNames(withSecret), ["keep"]);
  await withSecret.update((cookies) => cookies);
  // Re-encrypted with the configured secret.
  assert.deepEqual(
    await savedNames(
      createVaultStore({ dir, secret: "from-coolify", logger: silent }),
    ),
    ["keep"],
  );
});

test("an unreadable vault is moved aside instead of overwritten", async (t) => {
  const dir = await tempDir();
  t.after(() => fsp.rm(dir, { recursive: true, force: true }));
  await createVaultStore({ dir, secret: "one", logger: silent }).update(() => [
    { name: "a", value: "1", domain: "a.com", path: "/", session: true },
  ]);
  const other = createVaultStore({ dir, secret: "two", logger: silent });
  assert.deepEqual((await other.load()).cookies, []);
  const files = await fsp.readdir(dir);
  assert.ok(files.some((name) => name.startsWith("cookies.vault.unreadable-")));
});

test("concurrent writers do not lose each other's cookies", async (t) => {
  const dir = await tempDir();
  t.after(() => fsp.rm(dir, { recursive: true, force: true }));
  const stores = Array.from({ length: 8 }, () =>
    createVaultStore({ dir, logger: silent }),
  );
  await Promise.all(
    stores.map((store, i) =>
      store.update((cookies) =>
        applyDiff(cookies, {
          upserts: [
            {
              name: `c${i}`,
              value: "1",
              domain: "a.com",
              path: "/",
              session: true,
            },
          ],
          deletes: [],
        }),
      ),
    ),
  );
  assert.equal((await stores[0].load()).cookies.length, 8);
});

// ── Proxy against the fake Browser Run ──────────────────────────────────────

test("restores saved cookies before the client's first message", async (t) => {
  const { fake, vault, proxy } = await setup(t);
  await vault.update(() => [
    {
      name: "__Host-sid",
      value: "abc",
      domain: "app.example.com",
      path: "/",
      secure: true,
      session: true,
    },
    {
      name: "pref",
      value: "1",
      domain: ".example.com",
      path: "/",
      session: false,
      expires: hour(),
    },
  ]);
  const cdp = await connectCdp(proxy.wsEndpoint);
  const first = await cdp.send("Storage.getCookies");
  assert.deepEqual(first.result.cookies.map((cookie) => cookie.name).sort(), [
    "__Host-sid",
    "pref",
  ]);
  assert.equal(fake.stats.created, 1);
  assert.equal([...fake.sessions.values()][0].keepAlive, "600000");
  await cdp.close();
});

test("saves cookies a page sets, then restores them into a brand-new session", async (t) => {
  const { fake, vault, proxy } = await setup(t);
  const cdp = await connectCdp(proxy.wsEndpoint);
  await cdp.send("Test.pageSetsCookie", {
    cookie: {
      name: "login",
      value: "yes",
      url: "https://github.com/",
      secure: true,
      httpOnly: true,
    },
  });
  await waitFor(async () => (await savedNames(vault)).includes("login"), {
    label: "debounced save",
  });

  // Browser Run recycles the browser (idle timeout / release rollout).
  fake.kill("session-1");
  await cdp.closed;
  const again = await connectCdp(proxy.wsEndpoint);
  const cookies = (await again.send("Storage.getCookies")).result.cookies;
  assert.equal(fake.stats.created, 2);
  assert.deepEqual(
    cookies.map((cookie) => [cookie.name, cookie.domain, cookie.value]),
    [["login", "github.com", "yes"]],
  );
  await again.close();
});

test("a reconnect rejoins the live session instead of opening a new one", async (t) => {
  const { fake, proxy } = await setup(t);
  const first = await connectCdp(proxy.wsEndpoint);
  await first.send("Target.getTargets");
  await first.close();
  const second = await connectCdp(proxy.wsEndpoint);
  await second.send("Target.getTargets");
  assert.equal(fake.stats.created, 1);
  assert.ok(fake.stats.methods.includes("Browser.getVersion"));
  await second.close();
});

test("saves on disconnect, before the debounce fires", async (t) => {
  const { vault, proxy } = await setup(t, {
    saveDebounceMs: 60_000,
    saveMaxWaitMs: 60_000,
  });
  const cdp = await connectCdp(proxy.wsEndpoint);
  await cdp.send("Test.pageSetsCookie", {
    cookie: { name: "late", value: "1", url: "https://a.com/" },
  });
  await cdp.close();
  await waitFor(async () => (await savedNames(vault)).includes("late"), {
    label: "save on disconnect",
  });
});

test("Browser.close is held until the cookies are saved", async (t) => {
  const { fake, vault, proxy } = await setup(t, {
    saveDebounceMs: 60_000,
    saveMaxWaitMs: 60_000,
  });
  const cdp = await connectCdp(proxy.wsEndpoint);
  await cdp.send("Test.pageSetsCookie", {
    cookie: { name: "final", value: "1", url: "https://a.com/" },
  });
  await cdp.send("Browser.close");
  assert.deepEqual(await savedNames(vault), ["final"]);
  await cdp.closed;
  // The closed session is not retried; the next client gets a fresh one.
  const next = await connectCdp(proxy.wsEndpoint);
  await next.send("Target.getTargets");
  assert.equal(fake.stats.created, 2);
  await next.close();
});

test("one cookie Chrome rejects does not stop the rest from restoring", async (t) => {
  const { vault, proxy } = await setup(t);
  await vault.update(() => [
    { name: "bad", value: "1", domain: "a.com", path: "/", session: true },
    { name: "good", value: "1", domain: "a.com", path: "/", session: true },
  ]);
  const cdp = await connectCdp(proxy.wsEndpoint);
  const cookies = (await cdp.send("Storage.getCookies")).result.cookies;
  assert.deepEqual(
    cookies.map((cookie) => cookie.name),
    ["good"],
  );
  await cdp.close();
});

test("a logout removes the cookie from the vault without touching other sites", async (t) => {
  const { vault, proxy } = await setup(t);
  await vault.update(() => [
    { name: "mine", value: "1", domain: "a.com", path: "/", session: true },
  ]);
  const cdp = await connectCdp(proxy.wsEndpoint);
  await cdp.send("Target.getTargets");
  // Another conversation saves a login while this one is running.
  await vault.update((cookies) => [
    ...cookies,
    { name: "theirs", value: "1", domain: "b.com", path: "/", session: true },
  ]);
  await cdp.send("Test.pageDeletesCookie", { name: "mine" });
  await waitFor(async () => !(await savedNames(vault)).includes("mine"), {
    label: "logout saved",
  });
  assert.deepEqual(await savedNames(vault), ["theirs"]);
  await cdp.close();
});

test("proxy traffic is invisible to the client", async (t) => {
  const { proxy } = await setup(t);
  const cdp = await connectCdp(proxy.wsEndpoint);
  await cdp.send("Test.pageSetsCookie", {
    cookie: { name: "x", value: "1", url: "https://a.com/" },
  });
  await proxy.saveNow();
  const ids = cdp.events.filter((message) => message.id !== undefined);
  assert.deepEqual(ids, []);
  await cdp.close();
});

function upgradeStatus(url, headers = {}) {
  return new Promise((resolve) => {
    const ws = new WebSocket(url, { headers });
    ws.on("open", () => {
      ws.close();
      resolve(101);
    });
    ws.on("unexpected-response", (_req, res) => {
      resolve(res.statusCode);
      res.resume();
    });
    ws.on("error", () => resolve("error"));
  });
}

test("only the secret endpoint, reached directly, can drive the browser", async (t) => {
  const { fake, proxy } = await setup(t);
  const { origin, pathname } = new URL(proxy.wsEndpoint);
  assert.match(pathname, /^\/devtools\/browser\/[0-9a-f]{48}$/);
  // What a public p{port}.beenex.org preview request looks like.
  assert.equal(await upgradeStatus(`${origin}/devtools/browser`), 404);
  assert.equal(
    await upgradeStatus(`${origin}/devtools/browser/${"0".repeat(48)}`),
    404,
  );
  assert.equal(
    await upgradeStatus(proxy.wsEndpoint, { "x-forwarded-for": "203.0.113.7" }),
    404,
  );
  assert.equal(
    await upgradeStatus(proxy.wsEndpoint, {
      "x-forwarded-host": "p45000.beenex.org",
    }),
    404,
  );
  assert.equal(
    await upgradeStatus(proxy.wsEndpoint, {
      origin: "https://p3000.beenex.org",
    }),
    404,
  );
  assert.equal(
    fake.stats.created,
    0,
    "rejected clients must not open sessions",
  );
  assert.equal(await upgradeStatus(proxy.wsEndpoint), 101);
});

test("close() ends the Browser Run session", async (t) => {
  const { fake, proxy } = await setup(t);
  const cdp = await connectCdp(proxy.wsEndpoint);
  await cdp.send("Target.getTargets");
  await proxy.close();
  assert.deepEqual(fake.stats.deleted, ["session-1"]);
});

// ── CLI ─────────────────────────────────────────────────────────────────────

function runCli(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("exit", (code) => resolve({ code, stdout, stderr }));
  });
}

test("mcp mode wires chrome-devtools-mcp through the vault and cleans up", async (t) => {
  const fake = await startFakeBrowserRun();
  const dir = await tempDir();
  t.after(async () => {
    await fake.close();
    await fsp.rm(dir, { recursive: true, force: true });
  });
  const fakeChild = path.join(dir, "fake-chrome-devtools-mcp.mjs");
  const wsModule = new URL("../node_modules/ws/wrapper.mjs", import.meta.url)
    .href;
  await fsp.writeFile(
    fakeChild,
    `#!${process.execPath}
import WebSocket from ${JSON.stringify(wsModule)};
const endpoint = process.argv.find((arg) => arg.startsWith("--wsEndpoint=")).slice(13);
process.stdout.write(JSON.stringify({ endpoint, token: Boolean(process.env.CF_BROWSER_API_TOKEN), args: process.argv.slice(2) }) + "\\n");
const ws = new WebSocket(endpoint);
ws.on("open", () => ws.send(JSON.stringify({ id: 1, method: "Test.pageSetsCookie", params: { cookie: { name: "from-child", value: "1", url: "https://a.com/" } } })));
ws.on("message", () => { ws.close(); setTimeout(() => process.exit(7), 50); });
`,
    { mode: 0o755 },
  );
  const result = await runCli(["mcp", "--workspace=/tmp"], {
    CF_ACCOUNT_ID: ACCOUNT,
    CF_BROWSER_API_TOKEN: TOKEN,
    CF_BROWSER_API_BASE: fake.apiBase,
    CF_BROWSER_MCP_BIN: fakeChild,
    BROWSER_VAULT_DIR: dir,
  });
  assert.equal(result.code, 7, result.stderr);
  assert.match(result.stderr, /saved 1 new or changed/);
  assert.doesNotMatch(result.stderr, /failed/);
  const report = JSON.parse(result.stdout.trim());
  assert.match(
    report.endpoint,
    /^ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[0-9a-f]{48}$/,
  );
  assert.equal(report.token, false);
  assert.deepEqual(report.args.slice(1), ["--workspace=/tmp"]);
  assert.deepEqual(fake.stats.deleted, ["session-1"]);

  const list = await runCli(["list"], { BROWSER_VAULT_DIR: dir });
  assert.equal(list.code, 0);
  assert.match(list.stdout, /^a\.com\t1 cookie$/m);
  assert.ok(!list.stdout.includes("from-child=1"));

  const clear = await runCli(["clear", "a.com"], { BROWSER_VAULT_DIR: dir });
  assert.match(clear.stdout, /Removed 1 cookie for a\.com/);
  assert.deepEqual(
    await savedNames(createVaultStore({ dir, logger: silent })),
    [],
  );
});

test("mcp mode refuses to start without Browser Run credentials", async () => {
  const result = await runCli(["mcp"], {
    CF_ACCOUNT_ID: "",
    CF_BROWSER_API_TOKEN: "",
  });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /CF_ACCOUNT_ID and CF_BROWSER_API_TOKEN/);
});

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { request as httpRequest, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";

import {
  createAppAuth,
  hashPassword,
  parseCookies,
  safeEqual,
  signValue,
  verifyPassword,
  verifySignedValue,
} from "../../scripts/app-auth.mjs";
import { startStaticServer } from "../../scripts/static-server.mjs";

const SESSION_KEY = "test-session-api-key";
const BOOTSTRAP_EMAIL = "admin@beenex.org";
const BOOTSTRAP_PASSWORD = "correct-horse-battery";

describe("app-auth.mjs", () => {
  const servers: Server[] = [];
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve) => {
            // The proxy holds keep-alive sockets to the stub backend, which
            // would keep close() pending past the hook timeout.
            server.closeAllConnections?.();
            server.close(() => resolve());
          }),
      ),
    );
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function makeTempDir() {
    const dir = mkdtempSync(path.join(tmpdir(), "app-auth-"));
    tempDirs.push(dir);
    return dir;
  }

  /** A static server with the auth gate wired to an isolated store. */
  async function startGatedServer(
    envOverrides: Record<string, string> = {},
    routes: Record<string, string> = {},
    secureCookies = false,
  ) {
    const dir = makeTempDir();
    const stateDir = makeTempDir();
    writeFileSync(path.join(dir, "index.html"), "<html><head></head></html>");

    const appAuth = createAppAuth({
      env: {
        AUTH_BOOTSTRAP_EMAIL: BOOTSTRAP_EMAIL,
        AUTH_BOOTSTRAP_PASSWORD: BOOTSTRAP_PASSWORD,
        ...envOverrides,
      } as NodeJS.ProcessEnv,
      sessionApiKey: SESSION_KEY,
      storePath: path.join(stateDir, "app-auth.json"),
      secretPath: path.join(stateDir, "secret.txt"),
      secureCookies,
      basePath: "/",
      isProxied: (pathname: string) =>
        Object.keys(routes).some((prefix) => pathname.startsWith(prefix)),
    });

    const server = await startStaticServer({
      port: 0,
      host: "127.0.0.1",
      dir,
      routes,
      sessionApiKey: SESSION_KEY,
      appAuth,
    });
    servers.push(server);

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Static server did not bind to a TCP port");
    }
    return { base: `http://127.0.0.1:${address.port}`, appAuth };
  }

  const html = { Accept: "text/html" };

  function get(base: string, pathname: string, headers: HeadersInit = {}) {
    return fetch(`${base}${pathname}`, { headers, redirect: "manual" });
  }

  /** Sign in as the bootstrapped admin and return its session cookie. */
  async function login(base: string) {
    const response = await fetch(`${base}/api/app-auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: BOOTSTRAP_EMAIL,
        password: BOOTSTRAP_PASSWORD,
      }),
      redirect: "manual",
    });
    expect(response.status).toBe(200);
    const setCookie = response.headers.get("set-cookie") ?? "";
    const value = /ship_session=([^;]+)/.exec(setCookie)?.[1];
    expect(value).toBeTruthy();
    return `ship_session=${value}`;
  }

  describe("crypto helpers", () => {
    it("round-trips a password and rejects the wrong one", async () => {
      const stored = await hashPassword("a-very-good-password");
      expect(stored.startsWith("scrypt$")).toBe(true);
      expect(stored).not.toContain("a-very-good-password");
      await expect(
        verifyPassword("a-very-good-password", stored),
      ).resolves.toBe(true);
      await expect(verifyPassword("not-the-password", stored)).resolves.toBe(
        false,
      );
    });

    it("rejects a malformed stored hash instead of throwing", async () => {
      await expect(verifyPassword("x", "nonsense")).resolves.toBe(false);
      await expect(verifyPassword("x", "")).resolves.toBe(false);
    });

    it("verifies a signed value and rejects tampering", () => {
      const signed = signValue("secret", "session-id");
      expect(verifySignedValue("secret", signed)).toBe("session-id");
      expect(verifySignedValue("other-secret", signed)).toBeNull();
      expect(verifySignedValue("secret", "session-id.deadbeef")).toBeNull();
      expect(
        verifySignedValue("secret", `tampered.${signed.split(".")[1]}`),
      ).toBeNull();
      expect(verifySignedValue("secret", "no-signature")).toBeNull();
    });

    it("compares strings without leaking length mismatches as throws", () => {
      expect(safeEqual("abc", "abc")).toBe(true);
      expect(safeEqual("abc", "abd")).toBe(false);
      expect(safeEqual("abc", "abcd")).toBe(false);
      expect(safeEqual("abc", undefined as unknown as string)).toBe(false);
    });

    it("parses cookies and keeps the first value for a repeated name", () => {
      expect(parseCookies("a=1; b=two; a=3")).toEqual({ a: "1", b: "two" });
      expect(parseCookies("")).toEqual({});
      expect(parseCookies(undefined)).toEqual({});
      expect(parseCookies("encoded=a%20b")).toEqual({ encoded: "a b" });
    });
  });

  describe("public paths", () => {
    it("lets health checks and the auth surface through, nothing else", () => {
      const appAuth = createAppAuth({
        env: {} as NodeJS.ProcessEnv,
        storePath: path.join(makeTempDir(), "s.json"),
        secretPath: path.join(makeTempDir(), "k.txt"),
        isProxied: (pathname: string) =>
          ["/health", "/alive", "/ready"].includes(pathname),
      });
      for (const pathname of [
        "/health",
        "/alive",
        "/ready",
        "/callback",
        "/mcp/gmail/callback",
        "/workbench/terminal/health",
        "/api/github/oauth/callback",
        "/login",
        "/logout",
        "/api/app-auth/login",
        "/api/app-auth/google/callback",
        "/api/app-auth/accept",
      ]) {
        expect(appAuth.isPublicPath(pathname), pathname).toBe(true);
      }
      for (const pathname of [
        "/",
        "/index.html",
        "/api/conversations",
        "/api/automation/v1",
        "/sockets",
        "/api/app-auth/users",
        "/api/app-auth/tokens",
        "/api/app-auth/invites",
        "/admin/team",
      ]) {
        expect(appAuth.isPublicPath(pathname), pathname).toBe(false);
      }
    });
  });

  describe("Google sign-in origin", () => {
    const googleEnv = {
      AUTH_GOOGLE_CLIENT_ID: "client-id",
      AUTH_GOOGLE_CLIENT_SECRET: "client-secret",
    };

    function redirectUriOf(response: Response) {
      const location = response.headers.get("location") ?? "";
      return new URL(location).searchParams.get("redirect_uri");
    }

    it("hands Google an https callback even when the proxy says http", async () => {
      const { base } = await startGatedServer(googleEnv, {}, true);
      // fetch() owns the Host header, so assert on the scheme and path.
      const response = await get(base, "/api/app-auth/google/start", {
        "x-forwarded-proto": "http",
      });
      expect(response.status).toBe(302);
      const redirectUri = new URL(redirectUriOf(response) ?? "");
      expect(redirectUri.protocol).toBe("https:");
      expect(redirectUri.pathname).toBe("/api/app-auth/google/callback");
      expect(response.headers.get("set-cookie")).toMatch(/Secure/);
    });

    it("follows the forwarded protocol only for insecure-cookie deployments", async () => {
      const { base } = await startGatedServer(googleEnv, {}, false);
      const response = await get(base, "/api/app-auth/google/start", {
        "x-forwarded-proto": "http",
      });
      expect(response.status).toBe(302);
      const redirectUri = new URL(redirectUriOf(response) ?? "");
      expect(redirectUri.protocol).toBe("http:");
      expect(redirectUri.pathname).toBe("/api/app-auth/google/callback");
    });
  });

  describe("the gate", () => {
    it("stays off when nothing is configured", async () => {
      const { base, appAuth } = await startGatedServer({
        AUTH_BOOTSTRAP_EMAIL: "",
        AUTH_BOOTSTRAP_PASSWORD: "",
      });
      expect(appAuth.enabled()).toBe(false);
      const response = await get(base, "/", html);
      expect(response.status).toBe(200);
    });

    it("honours APP_AUTH_DISABLED as a kill switch", async () => {
      const { appAuth } = await startGatedServer({ APP_AUTH_DISABLED: "true" });
      expect(appAuth.enabled()).toBe(false);
    });

    it("redirects an unauthenticated navigation to /login", async () => {
      const { base } = await startGatedServer();
      const response = await get(base, "/", html);
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/login?returnTo=%2F");
    });

    it("never serves the SPA shell, and so never the session key, while signed out", async () => {
      const { base } = await startGatedServer();
      const response = await get(base, "/index.html", html);
      expect(response.status).toBe(302);
      expect(await response.text()).not.toContain(SESSION_KEY);
    });

    it("answers 401 JSON for an unauthenticated API call", async () => {
      const { base } = await startGatedServer();
      const response = await get(base, "/api/gate-probe");
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toMatchObject({
        login: "/login",
      });
    });

    // The proxied case — a health path is public because a backend answers it
    // — is covered by the public-paths test above. It cannot be exercised
    // through a live server here: MSW intercepts the proxy's own outbound
    // request and the proxied response never arrives.
    it("gates an unproxied health path so it cannot leak the shell", async () => {
      // Without a backend, /health would fall through to the SPA fallback and
      // hand the injected session key to anyone who asked for it.
      const { base } = await startGatedServer();
      const response = await get(base, "/health");
      expect(response.status).toBe(401);
      expect(await response.text()).not.toContain(SESSION_KEY);
    });

    it("serves the login page with a password form", async () => {
      const { base } = await startGatedServer();
      const response = await get(base, "/login", html);
      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).toContain('action="/api/app-auth/login"');
      expect(body).not.toContain(SESSION_KEY);
    });
  });

  describe("password sign-in", () => {
    it("rejects the wrong password and accepts the right one", async () => {
      const { base } = await startGatedServer();
      const bad = await fetch(`${base}/api/app-auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: BOOTSTRAP_EMAIL, password: "wrong" }),
        redirect: "manual",
      });
      expect(bad.status).toBe(401);
      expect(bad.headers.get("set-cookie")).toBeNull();

      const cookie = await login(base);
      expect(cookie).toContain("ship_session=");
    });

    it("admits the signed-in user to the SPA shell", async () => {
      const { base } = await startGatedServer();
      const cookie = await login(base);
      const response = await get(base, "/", { ...html, cookie });
      expect(response.status).toBe(200);
      expect(await response.text()).toContain(SESSION_KEY);
    });

    it("refuses a tampered session cookie", async () => {
      const { base } = await startGatedServer();
      const cookie = await login(base);
      const tampered = `${cookie.slice(0, -2)}xx`;
      const response = await get(base, "/api/gate-probe", {
        cookie: tampered,
      });
      expect(response.status).toBe(401);
    });

    it("ignores the cookie on a cross-origin request", async () => {
      // p{port}.beenex.org is the same *site* as ship.beenex.org, and the proxy
      // reflects those origins with Allow-Credentials, so the cookie must not
      // carry authority when the Origin is not our own.
      const { base } = await startGatedServer();
      const cookie = await login(base);
      const response = await get(base, "/api/gate-probe", {
        cookie,
        origin: "https://p3000.beenex.org",
      });
      expect(response.status).toBe(401);
    });

    it("drops the session on logout", async () => {
      const { base } = await startGatedServer();
      const cookie = await login(base);
      const out = await fetch(`${base}/api/app-auth/logout`, {
        method: "POST",
        headers: { cookie },
        redirect: "manual",
      });
      expect(out.status).toBe(200);
      const after = await get(base, "/api/gate-probe", { cookie });
      expect(after.status).toBe(401);
    });

    it("locks out after repeated failures", async () => {
      const { base } = await startGatedServer();
      let sawRateLimit = false;
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const response = await fetch(`${base}/api/app-auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: BOOTSTRAP_EMAIL, password: "nope" }),
          redirect: "manual",
        });
        if (response.status === 429) {
          sawRateLimit = true;
          break;
        }
      }
      expect(sawRateLimit).toBe(true);
    });
  });

  describe("agent and CI tokens", () => {
    it("mints a bearer token that authenticates, and revokes it", async () => {
      const { base } = await startGatedServer();
      const cookie = await login(base);

      const created = await fetch(`${base}/api/app-auth/tokens`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie },
        body: JSON.stringify({ label: "playwright-ci" }),
        redirect: "manual",
      });
      expect(created.status).toBe(201);
      const { token, id } = (await created.json()) as {
        token: string;
        id: string;
      };
      expect(token.startsWith("ship_pat_")).toBe(true);

      const me = await get(base, "/api/app-auth/me", {
        Authorization: `Bearer ${token}`,
      });
      expect(me.status).toBe(200);
      await expect(me.json()).resolves.toMatchObject({ via: "token" });

      // A token works cross-origin: browsers never attach it automatically.
      const shell = await get(base, "/", {
        ...html,
        Authorization: `Bearer ${token}`,
      });
      expect(shell.status).toBe(200);

      const revoked = await fetch(
        `${base}/api/app-auth/tokens?id=${encodeURIComponent(id)}`,
        { method: "DELETE", headers: { cookie }, redirect: "manual" },
      );
      expect(revoked.status).toBe(200);

      const afterRevoke = await get(base, "/api/app-auth/me", {
        Authorization: `Bearer ${token}`,
      });
      expect(afterRevoke.status).toBe(401);
    });

    it("refuses an unknown bearer token", async () => {
      const { base } = await startGatedServer();
      const response = await get(base, "/api/gate-probe", {
        Authorization: "Bearer ship_pat_not-a-real-token",
      });
      expect(response.status).toBe(401);
    });

    it("keeps token management to admins", async () => {
      const { base } = await startGatedServer();
      const cookie = await login(base);
      const created = await fetch(`${base}/api/app-auth/tokens`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie },
        body: JSON.stringify({ label: "member-token", role: "member" }),
      });
      const { token } = (await created.json()) as { token: string };

      const asMember = await get(base, "/api/app-auth/tokens", {
        Authorization: `Bearer ${token}`,
      });
      expect(asMember.status).toBe(403);
    });
  });

  describe("loopback bypass", () => {
    it("needs both loopback and the session key", async () => {
      const { base } = await startGatedServer();

      const withKey = await get(base, "/api/gate-probe", {
        "X-Session-API-Key": SESSION_KEY,
      });
      expect(withKey.status).not.toBe(401);

      const wrongKey = await get(base, "/api/gate-probe", {
        "X-Session-API-Key": "not-the-key",
      });
      expect(wrongKey.status).toBe(401);

      const noKey = await get(base, "/api/gate-probe");
      expect(noKey.status).toBe(401);
    });

    it("accepts the key from the query string, as the SDK WebSocket clients send it", async () => {
      const { base } = await startGatedServer();
      const response = await get(
        base,
        `/api/gate-probe?session_api_key=${encodeURIComponent(SESSION_KEY)}`,
      );
      expect(response.status).not.toBe(401);
    });
  });

  describe("invites", () => {
    it("invites an address, then accepts with a password", async () => {
      const { base, appAuth } = await startGatedServer();
      const cookie = await login(base);

      const invited = await fetch(`${base}/api/app-auth/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie },
        body: JSON.stringify({ email: "teammate@beenex.org" }),
      });
      expect(invited.status).toBe(201);
      const body = (await invited.json()) as {
        inviteUrl: string;
        delivered: boolean;
      };
      // No RESEND_API_KEY in tests, so the link comes back for the admin.
      expect(body.delivered).toBe(false);
      const token = new URL(body.inviteUrl).searchParams.get("token");
      expect(token).toBeTruthy();

      const accepted = await fetch(`${base}/api/app-auth/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token: token as string,
          password: "another-good-password",
          confirm: "another-good-password",
        }),
        redirect: "manual",
      });
      expect(accepted.status).toBe(302);
      expect(accepted.headers.get("set-cookie")).toContain("ship_session=");

      const store = await appAuth.loadStore();
      expect(store.users.map((u: { email: string }) => u.email)).toContain(
        "teammate@beenex.org",
      );
      expect(store.invites).toHaveLength(0);
    });

    it("rejects a reused invite token", async () => {
      const { base } = await startGatedServer();
      const cookie = await login(base);
      const invited = await fetch(`${base}/api/app-auth/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie },
        body: JSON.stringify({ email: "once@beenex.org" }),
      });
      const { inviteUrl } = (await invited.json()) as { inviteUrl: string };
      const token = new URL(inviteUrl).searchParams.get("token") as string;
      const params = () =>
        new URLSearchParams({
          token,
          password: "another-good-password",
          confirm: "another-good-password",
        });

      const first = await fetch(`${base}/api/app-auth/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params(),
        redirect: "manual",
      });
      expect(first.status).toBe(302);

      const second = await fetch(`${base}/api/app-auth/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params(),
        redirect: "manual",
      });
      expect(second.status).toBe(400);
    });

    it("refuses a short password", async () => {
      const { base } = await startGatedServer();
      const cookie = await login(base);
      const invited = await fetch(`${base}/api/app-auth/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie },
        body: JSON.stringify({ email: "short@beenex.org" }),
      });
      const { inviteUrl } = (await invited.json()) as { inviteUrl: string };
      const token = new URL(inviteUrl).searchParams.get("token") as string;

      const response = await fetch(`${base}/api/app-auth/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token,
          password: "short",
          confirm: "short",
        }),
        redirect: "manual",
      });
      expect(response.status).toBe(400);
      expect(await response.text()).toContain("at least");
    });

    it("will not invite an existing member", async () => {
      const { base } = await startGatedServer();
      const cookie = await login(base);
      const response = await fetch(`${base}/api/app-auth/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie },
        body: JSON.stringify({ email: BOOTSTRAP_EMAIL }),
      });
      expect(response.status).toBe(409);
    });
  });

  describe("members", () => {
    it("will not remove the last admin or yourself", async () => {
      const { base, appAuth } = await startGatedServer();
      const cookie = await login(base);
      const store = await appAuth.loadStore();
      const self = store.users.find(
        (u: { email: string }) => u.email === BOOTSTRAP_EMAIL,
      ) as { id: string };

      const response = await fetch(
        `${base}/api/app-auth/users?id=${encodeURIComponent(self.id)}`,
        { method: "DELETE", headers: { cookie } },
      );
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: expect.stringContaining("your own account"),
      });
    });
  });

  describe("websocket upgrades", () => {
    it("rejects an unauthenticated upgrade and admits a signed-in one", async () => {
      const { base } = await startGatedServer();
      const cookie = await login(base);
      const { port } = new URL(base);

      // `fetch` will not perform a raw upgrade, so drive it over node:http and
      // report whichever happens first: a response, an upgrade, or a close.
      const attempt = (headers: Record<string, string>) =>
        new Promise<string>((resolve) => {
          const req = httpRequest({
            host: "127.0.0.1",
            port: Number(port),
            path: "/sockets",
            headers: {
              Connection: "Upgrade",
              Upgrade: "websocket",
              "Sec-WebSocket-Version": "13",
              "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
              ...headers,
            },
          });
          const done = (value: string) => {
            resolve(value);
            req.destroy();
          };
          req.on("response", (res) => done(`status:${res.statusCode}`));
          req.on("upgrade", () => done("upgraded"));
          req.on("close", () => resolve("closed"));
          req.on("error", () => resolve("closed"));
          req.end();
        });

      // Unauthenticated: the gate writes a raw 401 before any proxying.
      expect(await attempt({})).toBe("status:401");
      // Authenticated: no backend is routed in this test, so the socket is
      // destroyed further down the pipeline — never a 401 from the gate.
      expect(await attempt({ cookie })).toBe("closed");
    });
  });
});

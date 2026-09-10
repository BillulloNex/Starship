/**
 * Click-to-connect GitHub for Starship.
 *
 * Two operator paths, same user experience (Connect → Authorize/Install):
 *   1. Classic OAuth App via Coolify `GITHUB_OAUTH_CLIENT_ID` +
 *      `GITHUB_OAUTH_CLIENT_SECRET` (covers personal + every org the user
 *      can already see).
 *   2. GitHub App Manifest when those env vars are absent: the first click
 *      creates the app on GitHub, the second installs it. Credentials persist
 *      on the OpenHands volume — nothing is pasted.
 *
 * Tokens are written to the agent-server secret store as `GITHUB_TOKEN` and
 * `GITHUB_PERSONAL_ACCESS_TOKEN`, and a git credential helper reads them so
 * `git clone https://github.com/...` works with no URL rewriting.
 */
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const GITHUB_OAUTH_API_PREFIX = "/api/github";
export const DEFAULT_GITHUB_OAUTH_ORIGIN = "https://ship.beenex.org";
export const DEFAULT_GITHUB_CONNECT_ORG = "BillulloNex";
export const GITHUB_TOKEN_SECRET_NAMES = [
  "GITHUB_TOKEN",
  "GITHUB_PERSONAL_ACCESS_TOKEN",
];
export const GITHUB_OAUTH_SCOPES = "repo read:org user:email workflow";

const STATE_TTL_MS = 20 * 60 * 1000;
const MAX_BODY_BYTES = 64 * 1024;

export function getPersistenceDir(env = process.env) {
  const explicit = String(env.OH_PERSISTENCE_DIR ?? "").trim();
  if (explicit) return explicit;
  const home = String(env.HOME ?? homedir() ?? "").trim() || "/home/openhands";
  return path.join(home, ".openhands");
}

export function getGithubAppPath(env = process.env) {
  return path.join(getPersistenceDir(env), "github-app.json");
}

export function getGithubConnectionPath(env = process.env) {
  return path.join(getPersistenceDir(env), "github-connection.json");
}

export function getGithubStatePath(env = process.env) {
  return path.join(getPersistenceDir(env), "github-oauth-states.json");
}

export function getPublicOrigin(env = process.env) {
  const explicit = String(env.GITHUB_OAUTH_PUBLIC_ORIGIN ?? "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const redirect = String(env.GROKBOT_MCP_OAUTH_REDIRECT_URI ?? "").trim();
  if (redirect) {
    try {
      return new URL(redirect).origin;
    } catch {
      // fall through
    }
  }
  return DEFAULT_GITHUB_OAUTH_ORIGIN;
}

export function getCallbackUrl(env = process.env) {
  return `${getPublicOrigin(env)}${GITHUB_OAUTH_API_PREFIX}/oauth/callback`;
}

export function getSetupUrl(env = process.env) {
  return `${getPublicOrigin(env)}${GITHUB_OAUTH_API_PREFIX}/oauth/setup`;
}

export function getConnectOrg(env = process.env) {
  return String(env.GITHUB_CONNECT_ORG ?? DEFAULT_GITHUB_CONNECT_ORG).trim();
}

export function getEnvOAuthClient(env = process.env) {
  const clientId = String(env.GITHUB_OAUTH_CLIENT_ID ?? "").trim();
  const clientSecret = String(env.GITHUB_OAUTH_CLIENT_SECRET ?? "").trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, kind: "oauth_app" };
}

export function parseGithubOAuthPath(pathname) {
  if (typeof pathname !== "string" || !pathname) return null;
  const normalized =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;
  if (normalized === GITHUB_OAUTH_API_PREFIX) {
    return { kind: "root" };
  }
  if (!normalized.startsWith(`${GITHUB_OAUTH_API_PREFIX}/`)) return null;
  const rest = normalized.slice(GITHUB_OAUTH_API_PREFIX.length + 1);
  const parts = rest.split("/").filter(Boolean);
  if (parts[0] === "oauth" && parts[1] === "status" && parts.length === 2) {
    return { kind: "status" };
  }
  if (parts[0] === "oauth" && parts[1] === "start" && parts.length === 2) {
    return { kind: "start" };
  }
  if (parts[0] === "oauth" && parts[1] === "callback" && parts.length === 2) {
    return { kind: "callback" };
  }
  if (parts[0] === "oauth" && parts[1] === "setup" && parts.length === 2) {
    return { kind: "setup" };
  }
  if (parts[0] === "oauth" && parts[1] === "disconnect" && parts.length === 2) {
    return { kind: "disconnect" };
  }
  if (parts[0] === "repos" && parts.length === 1) {
    return { kind: "repos" };
  }
  if (
    parts[0] === "repos" &&
    parts.length === 4 &&
    parts[3] === "branches"
  ) {
    return { kind: "branches", owner: parts[1], repo: parts[2] };
  }
  if (parts[0] === "ensure-workspace" && parts.length === 1) {
    return { kind: "ensure-workspace" };
  }
  if (parts[0] === "webhook" && parts.length === 1) {
    return { kind: "webhook" };
  }
  return { kind: "unknown" };
}

export function isGithubOAuthRequest(req) {
  try {
    const pathname = new URL(req?.url ?? "/", "http://localhost").pathname;
    return parseGithubOAuthPath(pathname) !== null;
  } catch {
    return false;
  }
}

export function buildGithubAuthorizeUrl({
  clientId,
  redirectUri,
  state,
  scopes = GITHUB_OAUTH_SCOPES,
  allowSignup = false,
}) {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  if (scopes) url.searchParams.set("scope", scopes);
  url.searchParams.set("allow_signup", allowSignup ? "true" : "false");
  return url.toString();
}

export function buildGithubAppInstallUrl(slug, { state } = {}) {
  const url = new URL(
    `https://github.com/apps/${encodeURIComponent(slug)}/installations/new`,
  );
  if (state) url.searchParams.set("state", state);
  return url.toString();
}

export function buildGithubAppManifest(env = process.env) {
  const origin = getPublicOrigin(env);
  const name = String(env.GITHUB_CONNECT_APP_NAME ?? "Starship").trim() || "Starship";
  return {
    name,
    url: origin,
    hook_attributes: {
      url: `${origin}${GITHUB_OAUTH_API_PREFIX}/webhook`,
      active: false,
    },
    redirect_url: getCallbackUrl(env),
    callback_urls: [getCallbackUrl(env)],
    setup_url: getSetupUrl(env),
    public: false,
    request_oauth_on_install: true,
    default_permissions: {
      contents: "write",
      pull_requests: "write",
      metadata: "read",
      workflows: "write",
    },
  };
}

export function buildGithubAppManifestActionUrl(org) {
  if (org) {
    return `https://github.com/organizations/${encodeURIComponent(org)}/settings/apps/new`;
  }
  return "https://github.com/settings/apps/new";
}

export function mapGithubRepo(repo) {
  if (!repo || typeof repo !== "object") return null;
  const fullName = String(repo.full_name ?? "").trim();
  if (!fullName) return null;
  return {
    id: String(repo.id ?? fullName),
    full_name: fullName,
    git_provider: "github",
    is_public: repo.private !== true,
    stargazers_count:
      typeof repo.stargazers_count === "number" ? repo.stargazers_count : undefined,
    pushed_at: typeof repo.pushed_at === "string" ? repo.pushed_at : undefined,
    main_branch:
      typeof repo.default_branch === "string" ? repo.default_branch : undefined,
  };
}

export function mapGithubBranch(branch) {
  if (!branch || typeof branch !== "object") return null;
  const name = String(branch.name ?? "").trim();
  if (!name) return null;
  return {
    name,
    commit_sha: String(branch.commit?.sha ?? ""),
    protected: Boolean(branch.protected),
  };
}

export function createAppJwt(appId, pem, nowSec = Math.floor(Date.now() / 1000)) {
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iat: nowSec - 60,
      exp: nowSec + 540,
      iss: String(appId),
    }),
  ).toString("base64url");
  const data = `${header}.${payload}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(data);
  const signature = signer.sign(pem).toString("base64url");
  return `${data}.${signature}`;
}

async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (err) {
    if (err && err.code === "ENOENT") return fallback;
    throw err;
  }
}

async function writeJsonFile(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(tempPath, filePath);
}

export async function loadGithubApp(env = process.env) {
  const data = await readJsonFile(getGithubAppPath(env), null);
  if (!data || typeof data !== "object") return null;
  if (!data.clientId || !data.id) return null;
  return data;
}

export async function loadGithubConnection(env = process.env) {
  const data = await readJsonFile(getGithubConnectionPath(env), null);
  if (!data || typeof data !== "object") return null;
  return data;
}

export function publicStatus(connection, envOAuth, app) {
  const connected = Boolean(
    connection?.login && (connection.userToken || connection.installationId),
  );
  return {
    configured: Boolean(envOAuth || app),
    connected,
    login: connected ? connection.login : null,
    name: connected ? connection.name || null : null,
    avatarUrl: connected ? connection.avatarUrl || null : null,
    mode: envOAuth ? "oauth_app" : app ? "github_app" : "unset",
  };
}

async function saveState(state, payload, env = process.env) {
  const all = await readJsonFile(getGithubStatePath(env), {});
  const now = Date.now();
  for (const [key, value] of Object.entries(all)) {
    if (!value?.createdAt || now - value.createdAt > STATE_TTL_MS) {
      delete all[key];
    }
  }
  all[state] = { ...payload, createdAt: now };
  await writeJsonFile(getGithubStatePath(env), all);
}

async function consumeState(state, env = process.env) {
  if (!state) return null;
  const all = await readJsonFile(getGithubStatePath(env), {});
  const payload = all[state] ?? null;
  if (payload) delete all[state];
  await writeJsonFile(getGithubStatePath(env), all);
  if (!payload?.createdAt || Date.now() - payload.createdAt > STATE_TTL_MS) {
    return null;
  }
  return payload;
}

function writeJson(res, status, payload) {
  if (res.headersSent) return;
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function writeHtml(res, status, html) {
  if (res.headersSent) return;
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(html);
}

function redirect(res, location) {
  if (res.headersSent) return;
  res.writeHead(302, { Location: location, "Cache-Control": "no-store" });
  res.end();
}

async function githubFetch(url, { token, jwt, method = "GET", body, headers } = {}) {
  const authHeaders = { Accept: "application/vnd.github+json", ...headers };
  if (jwt) authHeaders.Authorization = `Bearer ${jwt}`;
  else if (token) authHeaders.Authorization = `Bearer ${token}`;
  if (body && !authHeaders["Content-Type"]) {
    authHeaders["Content-Type"] = "application/json";
  }
  const response = await fetch(url, {
    method,
    headers: authHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!response.ok) {
    const message =
      (json && (json.error_description || json.message || json.error)) ||
      text.slice(0, 200) ||
      `GitHub request failed (${response.status})`;
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }
  return json;
}

export async function exchangeOAuthCode({
  clientId,
  clientSecret,
  code,
  redirectUri,
}) {
  return githubFetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    body: {
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    },
    headers: { Accept: "application/json" },
  });
}

export async function refreshOAuthToken({ clientId, clientSecret, refreshToken }) {
  return githubFetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    body: {
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    },
    headers: { Accept: "application/json" },
  });
}

async function convertAppManifest(code) {
  return githubFetch(`https://api.github.com/app-manifests/${code}/conversions`, {
    method: "POST",
  });
}

async function fetchGithubUser(token) {
  return githubFetch("https://api.github.com/user", { token });
}

async function mintInstallationToken(app, installationId) {
  const jwt = createAppJwt(app.id, app.pem);
  const data = await githubFetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    { jwt, method: "POST" },
  );
  return data.token;
}

export async function resolveAccessToken(env = process.env) {
  const envToken = String(
    env.GITHUB_TOKEN || env.GITHUB_PERSONAL_ACCESS_TOKEN || env.GH_TOKEN || "",
  ).trim();
  if (envToken) return envToken;

  const connection = await loadGithubConnection(env);
  if (!connection) return "";

  if (connection.userToken) {
    const expiresAt = Date.parse(connection.userTokenExpiresAt || "");
    const stillFresh =
      !Number.isFinite(expiresAt) || expiresAt - Date.now() > 60_000;
    if (stillFresh) return connection.userToken;
    if (connection.refreshToken) {
      const envOAuth = getEnvOAuthClient(env);
      const app = await loadGithubApp(env);
      const clientId = envOAuth?.clientId || app?.clientId;
      const clientSecret = envOAuth?.clientSecret || app?.clientSecret;
      if (clientId && clientSecret) {
        const refreshed = await refreshOAuthToken({
          clientId,
          clientSecret,
          refreshToken: connection.refreshToken,
        });
        if (refreshed?.access_token) {
          const next = {
            ...connection,
            userToken: refreshed.access_token,
            refreshToken: refreshed.refresh_token || connection.refreshToken,
            userTokenExpiresAt: refreshed.expires_in
              ? new Date(Date.now() + Number(refreshed.expires_in) * 1000).toISOString()
              : connection.userTokenExpiresAt,
          };
          await writeJsonFile(getGithubConnectionPath(env), next);
          return next.userToken;
        }
      }
    }
    return connection.userToken;
  }

  if (connection.installationId) {
    const app = await loadGithubApp(env);
    if (app?.pem && app?.id) {
      return mintInstallationToken(app, connection.installationId);
    }
  }
  return "";
}

async function upsertAgentSecrets(token, { agentServerUrl, sessionApiKey }) {
  if (!token || !agentServerUrl) return;
  const headers = { "Content-Type": "application/json" };
  if (sessionApiKey) headers["X-Session-API-Key"] = sessionApiKey;
  for (const name of GITHUB_TOKEN_SECRET_NAMES) {
    try {
      await fetch(`${agentServerUrl.replace(/\/+$/, "")}/api/settings/secrets`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          name,
          value: token,
          description: "GitHub access from Starship Connect GitHub",
        }),
      });
    } catch (err) {
      console.warn(
        `[github-oauth] Failed to save ${name}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}

async function deleteAgentSecrets({ agentServerUrl, sessionApiKey }) {
  if (!agentServerUrl) return;
  const headers = {};
  if (sessionApiKey) headers["X-Session-API-Key"] = sessionApiKey;
  for (const name of GITHUB_TOKEN_SECRET_NAMES) {
    try {
      await fetch(
        `${agentServerUrl.replace(/\/+$/, "")}/api/settings/secrets/${encodeURIComponent(name)}`,
        { method: "DELETE", headers },
      );
    } catch {
      // best-effort
    }
  }
}

async function applyGitIdentity(connection) {
  const name = String(connection?.name || connection?.login || "").trim();
  const email = String(connection?.email || "").trim();
  if (name) {
    await runGit(["config", "--global", "user.name", name]).catch(() => {});
  }
  if (email) {
    await runGit(["config", "--global", "user.email", email]).catch(() => {});
  }
}

function runGit(args, options = {}) {
  const helper = getGithubCredentialHelperPath(process.env);
  const gitArgs = existsSync(helper)
    ? ["-c", "credential.helper=", "-c", `credential.helper=${helper}`, ...args]
    : args;
  return new Promise((resolve, reject) => {
    const child = spawn("git", gitArgs, {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
        ...options.env,
      },
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `git ${args[0]} failed (${code})`));
    });
  });
}

export function getGithubCredentialHelperPath(env = process.env) {
  const explicit = String(env.GITHUB_GIT_CREDENTIAL_HELPER ?? "").trim();
  if (explicit) return explicit;
  const bundled = "/opt/agent-canvas/github-git-credential.sh";
  if (existsSync(bundled)) return bundled;
  return path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "github-git-credential.sh",
  );
}

export function workspaceRoot(env = process.env) {
  const explicit = String(env.GITHUB_WORKSPACE_ROOT ?? "").trim();
  if (explicit) return explicit;
  if (existsSync("/projects")) return "/projects";
  const home = String(env.HOME ?? homedir() ?? "").trim() || "/home/openhands";
  return home;
}

export function workspacePathForRepo(fullName, env = process.env) {
  const basename = String(fullName ?? "")
    .trim()
    .split("/")
    .filter(Boolean)
    .pop();
  if (!basename) throw new Error("Repository name is required");
  return path.join(workspaceRoot(env), basename);
}

async function saveConnectionFromUserToken(tokenPayload, extra = {}, env = process.env) {
  const user = await fetchGithubUser(tokenPayload.access_token);
  const connection = {
    login: user.login,
    name: user.name || user.login,
    email: user.email || "",
    avatarUrl: user.avatar_url || "",
    userToken: tokenPayload.access_token,
    refreshToken: tokenPayload.refresh_token || "",
    userTokenExpiresAt: tokenPayload.expires_in
      ? new Date(Date.now() + Number(tokenPayload.expires_in) * 1000).toISOString()
      : null,
    installationId: extra.installationId || null,
    connectedAt: new Date().toISOString(),
  };
  await writeJsonFile(getGithubConnectionPath(env), connection);
  await applyGitIdentity(connection);
  return connection;
}

function frontendReturnPath(query) {
  const next = String(query.get("next") || "/settings/app").trim();
  if (!next.startsWith("/") || next.startsWith("//")) return "/settings/app";
  return next;
}

function successRedirect(next, extra = {}) {
  const url = new URL(next, "http://starship.local");
  url.searchParams.set("github", "connected");
  for (const [key, value] of Object.entries(extra)) {
    if (value) url.searchParams.set(key, String(value));
  }
  return `${url.pathname}${url.search}`;
}

function errorRedirect(next, message) {
  const url = new URL(next, "http://starship.local");
  url.searchParams.set("github", "error");
  url.searchParams.set("github_error", message.slice(0, 180));
  return `${url.pathname}${url.search}`;
}

function autoPostForm({ action, fields }) {
  const inputs = Object.entries(fields)
    .map(
      ([name, value]) =>
        `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}" />`,
    )
    .join("");
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Connect GitHub</title></head>
  <body>
    <p>Continue to GitHub…</p>
    <form id="github-connect" method="post" action="${escapeHtml(action)}">${inputs}</form>
    <script>document.getElementById("github-connect").submit();</script>
  </body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function handleStart(req, res, env) {
  const incoming = new URL(req.url ?? "/", "http://localhost");
  const next = frontendReturnPath(incoming.searchParams);
  const state = crypto.randomBytes(16).toString("hex");
  const envOAuth = getEnvOAuthClient(env);
  const app = await loadGithubApp(env);
  const connection = await loadGithubConnection(env);

  if (envOAuth) {
    await saveState(state, { kind: "oauth", next }, env);
    redirect(
      res,
      buildGithubAuthorizeUrl({
        clientId: envOAuth.clientId,
        redirectUri: getCallbackUrl(env),
        state,
      }),
    );
    return;
  }

  if (!app) {
    await saveState(state, { kind: "manifest", next }, env);
    const org = getConnectOrg(env);
    writeHtml(
      res,
      200,
      autoPostForm({
        action: buildGithubAppManifestActionUrl(org || undefined),
        fields: {
          manifest: JSON.stringify(buildGithubAppManifest(env)),
          state,
        },
      }),
    );
    return;
  }

  if (!connection?.installationId) {
    await saveState(state, { kind: "install", next }, env);
    redirect(res, buildGithubAppInstallUrl(app.slug, { state }));
    return;
  }

  await saveState(state, { kind: "oauth", next }, env);
  redirect(
    res,
    buildGithubAuthorizeUrl({
      clientId: app.clientId,
      redirectUri: getCallbackUrl(env),
      state,
      scopes: "",
    }),
  );
}

async function finishOAuth(res, tokenPayload, extra, options) {
  const connection = await saveConnectionFromUserToken(tokenPayload, extra, options.env);
  await upsertAgentSecrets(connection.userToken, options);
  redirect(res, successRedirect(extra.next || "/settings/app", { login: connection.login }));
}

async function handleCallback(req, res, options) {
  const { env } = options;
  const incoming = new URL(req.url ?? "/", "http://localhost");
  const code = incoming.searchParams.get("code");
  const state = incoming.searchParams.get("state");
  const setupAction = incoming.searchParams.get("setup_action");
  const installationId = incoming.searchParams.get("installation_id");
  const pending = await consumeState(state, env);
  const next = pending?.next || "/settings/app";

  try {
    if (incoming.searchParams.get("error")) {
      throw new Error(
        incoming.searchParams.get("error_description") ||
          incoming.searchParams.get("error"),
      );
    }

    if (pending?.kind === "manifest" && code) {
      const created = await convertAppManifest(code);
      await writeJsonFile(getGithubAppPath(env), {
        id: created.id,
        slug: created.slug,
        clientId: created.client_id,
        clientSecret: created.client_secret,
        pem: created.pem,
        webhookSecret: created.webhook_secret,
        owner: created.owner?.login || getConnectOrg(env),
      });
      const installState = crypto.randomBytes(16).toString("hex");
      await saveState(installState, { kind: "install", next }, env);
      redirect(
        res,
        buildGithubAppInstallUrl(created.slug, { state: installState }),
      );
      return;
    }

    if ((pending?.kind === "install" || setupAction || installationId) && installationId) {
      const app = await loadGithubApp(env);
      const envOAuth = getEnvOAuthClient(env);
      const clientId = envOAuth?.clientId || app?.clientId;
      const clientSecret = envOAuth?.clientSecret || app?.clientSecret;
      if (code && clientId && clientSecret) {
        const tokenPayload = await exchangeOAuthCode({
          clientId,
          clientSecret,
          code,
          redirectUri: getCallbackUrl(env),
        });
        await finishOAuth(
          res,
          tokenPayload,
          { next, installationId },
          options,
        );
        return;
      }
      if (app?.pem) {
        const token = await mintInstallationToken(app, installationId);
        const jwt = createAppJwt(app.id, app.pem);
        const installation = await githubFetch(
          `https://api.github.com/app/installations/${installationId}`,
          { jwt },
        );
        const account = installation.account || {};
        const connection = {
          login: account.login || getConnectOrg(env),
          name: account.login || getConnectOrg(env),
          email: "",
          avatarUrl: account.avatar_url || "",
          userToken: "",
          refreshToken: "",
          userTokenExpiresAt: null,
          installationId,
          connectedAt: new Date().toISOString(),
        };
        await writeJsonFile(getGithubConnectionPath(env), connection);
        await upsertAgentSecrets(token, options);
        redirect(res, successRedirect(next, { login: connection.login }));
        return;
      }
    }

    if (code) {
      const envOAuth = getEnvOAuthClient(env);
      const app = await loadGithubApp(env);
      const clientId = envOAuth?.clientId || app?.clientId;
      const clientSecret = envOAuth?.clientSecret || app?.clientSecret;
      if (!clientId || !clientSecret) {
        throw new Error("GitHub OAuth client is not configured.");
      }
      const tokenPayload = await exchangeOAuthCode({
        clientId,
        clientSecret,
        code,
        redirectUri: getCallbackUrl(env),
      });
      await finishOAuth(res, tokenPayload, { next, installationId }, options);
      return;
    }

    throw new Error("GitHub did not return an authorization code.");
  } catch (err) {
    console.error("[github-oauth] callback failed:", err);
    redirect(
      res,
      errorRedirect(
        next,
        err instanceof Error ? err.message : "GitHub connect failed",
      ),
    );
  }
}

async function handleRepos(req, res, env) {
  const incoming = new URL(req.url ?? "/", "http://localhost");
  const query = String(incoming.searchParams.get("query") ?? "").trim();
  const pageId = incoming.searchParams.get("page_id") || "1";
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(incoming.searchParams.get("limit") || "30", 10) || 30),
  );
  const page = Math.max(1, Number.parseInt(pageId, 10) || 1);
  const token = await resolveAccessToken(env);
  if (!token) {
    writeJson(res, 401, { error: "Connect GitHub first.", items: [], next_page_id: null });
    return;
  }

  let items = [];
  if (query) {
    const search = await githubFetch(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=${limit}&page=${page}`,
      { token },
    );
    items = (search.items || []).map(mapGithubRepo).filter(Boolean);
  } else {
    const repos = await githubFetch(
      `https://api.github.com/user/repos?per_page=${limit}&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`,
      { token },
    );
    items = (Array.isArray(repos) ? repos : []).map(mapGithubRepo).filter(Boolean);
  }
  writeJson(res, 200, {
    items,
    next_page_id: items.length < limit ? null : String(page + 1),
  });
}

async function handleBranches(req, res, parsed, env) {
  const incoming = new URL(req.url ?? "/", "http://localhost");
  const query = String(incoming.searchParams.get("query") ?? "").trim().toLowerCase();
  const pageId = incoming.searchParams.get("page_id") || "1";
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(incoming.searchParams.get("limit") || "30", 10) || 30),
  );
  const page = Math.max(1, Number.parseInt(pageId, 10) || 1);
  const token = await resolveAccessToken(env);
  if (!token) {
    writeJson(res, 401, { error: "Connect GitHub first.", items: [], next_page_id: null });
    return;
  }
  const branches = await githubFetch(
    `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/branches?per_page=${limit}&page=${page}`,
    { token },
  );
  let items = (Array.isArray(branches) ? branches : [])
    .map(mapGithubBranch)
    .filter(Boolean);
  if (query) {
    items = items.filter((branch) => branch.name.toLowerCase().includes(query));
  }
  writeJson(res, 200, {
    items,
    next_page_id: items.length < limit ? null : String(page + 1),
  });
}

async function handleEnsureWorkspace(req, res, env) {
  const payload = await readJsonBody(req);
  const fullName = String(payload.full_name ?? payload.repository ?? "").trim();
  const branch = String(payload.branch ?? "").trim();
  if (!fullName.includes("/")) {
    writeJson(res, 400, { error: "full_name must be owner/repo" });
    return;
  }
  const dest = workspacePathForRepo(fullName, env);
  const token = await resolveAccessToken(env);
  const gitEnv = token
    ? { GITHUB_TOKEN: token, GIT_TERMINAL_PROMPT: "0" }
    : { GIT_TERMINAL_PROMPT: "0" };
  await mkdir(path.dirname(dest), { recursive: true });
  if (existsSync(path.join(dest, ".git"))) {
    if (branch) {
      await runGit(["-C", dest, "fetch", "origin", branch], { env: gitEnv });
      await runGit(["-C", dest, "checkout", branch], { env: gitEnv }).catch(() =>
        runGit(["-C", dest, "checkout", "-B", branch, `origin/${branch}`], {
          env: gitEnv,
        }),
      );
    }
    writeJson(res, 200, { path: dest, cloned: false, full_name: fullName });
    return;
  }
  const args = ["clone", "--depth", "1"];
  if (branch) args.push("--branch", branch, "--single-branch");
  args.push(`https://github.com/${fullName}.git`, dest);
  await runGit(args, { env: gitEnv });
  writeJson(res, 200, { path: dest, cloned: true, full_name: fullName });
}

async function readJsonBody(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) throw new Error("Request body too large");
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

export async function handleGithubOAuthRequest(req, res, options = {}) {
  const env = options.env || process.env;
  let parsed;
  try {
    const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    parsed = parseGithubOAuthPath(pathname);
  } catch {
    return false;
  }
  if (!parsed) return false;

  try {
    if (parsed.kind === "status" && req.method === "GET") {
      const [app, connection] = await Promise.all([
        loadGithubApp(env),
        loadGithubConnection(env),
      ]);
      writeJson(res, 200, publicStatus(connection, getEnvOAuthClient(env), app));
      return true;
    }
    if (parsed.kind === "start" && req.method === "GET") {
      await handleStart(req, res, env);
      return true;
    }
    if (
      (parsed.kind === "callback" || parsed.kind === "setup") &&
      (req.method === "GET" || req.method === "HEAD")
    ) {
      await handleCallback(req, res, {
        env,
        agentServerUrl: options.agentServerUrl,
        sessionApiKey: options.sessionApiKey,
      });
      return true;
    }
    if (parsed.kind === "disconnect" && req.method === "POST") {
      await writeJsonFile(getGithubConnectionPath(env), {});
      await deleteAgentSecrets(options);
      writeJson(res, 200, { ok: true });
      return true;
    }
    if (parsed.kind === "repos" && req.method === "GET") {
      await handleRepos(req, res, env);
      return true;
    }
    if (parsed.kind === "branches" && req.method === "GET") {
      await handleBranches(req, res, parsed, env);
      return true;
    }
    if (parsed.kind === "ensure-workspace" && req.method === "POST") {
      await handleEnsureWorkspace(req, res, env);
      return true;
    }
    if (parsed.kind === "webhook") {
      writeJson(res, 200, { ok: true });
      return true;
    }
    writeJson(res, 404, { error: "Unknown GitHub OAuth route" });
    return true;
  } catch (err) {
    console.error("[github-oauth]", err);
    writeJson(res, err.status && err.status < 600 ? err.status : 500, {
      error: err instanceof Error ? err.message : "GitHub OAuth failed",
    });
    return true;
  }
}

async function printCredentialToken() {
  const token = await resolveAccessToken();
  if (!token) {
    process.exitCode = 1;
    return;
  }
  process.stdout.write(token);
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain && process.argv[2] === "credential-token") {
  printCredentialToken().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}

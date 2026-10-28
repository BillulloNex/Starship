/**
 * Starship app-native authentication.
 *
 * Replaces Cloudflare Access as the gate in front of ship.beenex.org. The
 * whole surface is server-rendered from this module, so an unauthenticated
 * visitor never receives the SPA shell — and therefore never receives the
 * agent-server session key that `static-server.mjs` injects into index.html.
 *
 * Three ways in:
 *   1. Session cookie, from email/password or Google sign-in (humans).
 *   2. `Authorization: Bearer ship_pat_…` (agents, CI, Playwright).
 *   3. Loopback + a correct X-Session-API-Key (in-container callers only).
 *
 * Accounts are invite-only: Google sign-in succeeds only for an email an admin
 * has already added. State lives in one atomic JSON document on the durable
 * OpenHands volume.
 */
import crypto from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import process from "node:process";

import {
  isMailerConfigured,
  sendInviteEmail,
  sendPasswordResetEmail,
} from "./mailer.mjs";

export const APP_AUTH_API_PREFIX = "/api/app-auth";
export const LOGIN_PATH = "/login";
export const LOGOUT_PATH = "/logout";
export const ADMIN_TEAM_PATH = "/admin/team";

const SESSION_COOKIE = "ship_session";
const OAUTH_NONCE_COOKIE = "ship_oauth_nonce";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const INVITE_TTL_MS = 72 * 60 * 60 * 1000;
const RESET_TTL_MS = 2 * 60 * 60 * 1000;
const TOKEN_PREFIX = "ship_pat_";
const MAX_BODY_BYTES = 64 * 1024;
const MIN_PASSWORD_LENGTH = 12;

// Failed-login throttling.
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX_FAILURES = 8;

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
const GOOGLE_SCOPES = "openid email profile";

const LOOPBACK_ADDRESSES = new Set([
  "127.0.0.1",
  "::1",
  "::ffff:127.0.0.1",
  "localhost",
]);

// Health checks are public only when a backend route actually serves them.
// Without that condition an unproxied /health falls through to the SPA
// fallback, which would hand the injected session key to anyone who asked.
const PUBLIC_HEALTH_PATHS = new Set(["/health", "/alive", "/ready"]);

// Paths that must answer before anyone is signed in: OAuth callbacks owned by
// other modules, and the auth surface itself.
const PUBLIC_EXACT_PATHS = new Set([
  "/callback",
  "/mcp/gmail/callback",
  "/workbench/terminal/health",
  "/api/github/oauth/callback",
  "/api/github/oauth/setup",
  "/api/github/webhook",
  "/api/glitchtip-tunnel",
  LOGIN_PATH,
  LOGOUT_PATH,
]);

// Everything under /api/app-auth is public except these, which an admin owns.
const ADMIN_API_PATHS = new Set([
  `${APP_AUTH_API_PREFIX}/invites`,
  `${APP_AUTH_API_PREFIX}/users`,
  `${APP_AUTH_API_PREFIX}/tokens`,
]);

// ─────────────────────────────────────────────────────────────────────────────
// Paths and the store
// ─────────────────────────────────────────────────────────────────────────────

export function getPersistenceDir(env = process.env) {
  const explicit = String(env.OH_PERSISTENCE_DIR ?? "").trim();
  if (explicit) return explicit;
  const home = String(env.HOME ?? homedir() ?? "").trim() || "/home/openhands";
  return path.join(home, ".openhands");
}

export function getAppAuthDir(env = process.env) {
  const explicit = String(env.APP_AUTH_DIR ?? "").trim();
  if (explicit) return explicit;
  return path.join(getPersistenceDir(env), "agent-canvas", "app-auth");
}

export function getAppAuthStorePath(env = process.env) {
  return path.join(getAppAuthDir(env), "app-auth.json");
}

export function getAppAuthSecretPath(env = process.env) {
  return path.join(getAppAuthDir(env), "app-auth-secret.txt");
}

function emptyStore() {
  return { version: 1, users: [], sessions: [], invites: [], tokens: [] };
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

function normalizeStore(raw) {
  const base = emptyStore();
  if (!raw || typeof raw !== "object") return base;
  return {
    version: 1,
    users: Array.isArray(raw.users) ? raw.users : [],
    sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
    invites: Array.isArray(raw.invites) ? raw.invites : [],
    tokens: Array.isArray(raw.tokens) ? raw.tokens : [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Crypto helpers
// ─────────────────────────────────────────────────────────────────────────────

function randomId(bytes = 16) {
  return crypto.randomBytes(bytes).toString("hex");
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/** Constant-time string compare; mirrors workbench-terminal.mjs `keysMatch`. */
export function safeEqual(expected, provided) {
  if (typeof expected !== "string" || typeof provided !== "string") {
    return false;
  }
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function hmac(secret, value) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

export function signValue(secret, value) {
  return `${value}.${hmac(secret, value)}`;
}

export function verifySignedValue(secret, signed) {
  if (typeof signed !== "string") return null;
  const index = signed.lastIndexOf(".");
  if (index <= 0) return null;
  const value = signed.slice(0, index);
  const signature = signed.slice(index + 1);
  if (!safeEqual(hmac(secret, value), signature)) return null;
  return value;
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      SCRYPT_KEYLEN,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P },
      (err, key) => (err ? reject(err) : resolve(key)),
    );
  });
  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

export async function verifyPassword(password, stored) {
  if (typeof stored !== "string" || typeof password !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nRaw, rRaw, pRaw, saltB64, hashB64] = parts;
  const N = Number.parseInt(nRaw, 10);
  const r = Number.parseInt(rRaw, 10);
  const p = Number.parseInt(pRaw, 10);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) {
    return false;
  }
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  try {
    const derived = await new Promise((resolve, reject) => {
      crypto.scrypt(password, salt, expected.length, { N, r, p }, (err, key) =>
        err ? reject(err) : resolve(key),
      );
    });
    return (
      derived.length === expected.length &&
      crypto.timingSafeEqual(derived, expected)
    );
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP helpers
// ─────────────────────────────────────────────────────────────────────────────

export function parseCookies(header) {
  const out = {};
  if (typeof header !== "string" || !header) return out;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 1) continue;
    const name = part.slice(0, index).trim();
    if (!name || name in out) continue;
    out[name] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return out;
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path ?? "/"}`);
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  parts.push("HttpOnly");
  parts.push(`SameSite=${options.sameSite ?? "Lax"}`);
  if (options.secure !== false) parts.push("Secure");
  return parts.join("; ");
}

function appendSetCookie(res, cookie) {
  const existing = res.getHeader("Set-Cookie");
  if (!existing) {
    res.setHeader("Set-Cookie", [cookie]);
    return;
  }
  res.setHeader(
    "Set-Cookie",
    Array.isArray(existing) ? [...existing, cookie] : [existing, cookie],
  );
}

function writeJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function writeHtml(res, status, html) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(html),
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(html);
}

function redirect(res, location, extraHeaders = {}) {
  res.writeHead(302, {
    Location: location,
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  res.end();
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function readParams(req) {
  const raw = await readBody(req);
  const type = String(req.headers["content-type"] ?? "");
  if (type.includes("application/json")) {
    try {
      const parsed = JSON.parse(raw || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return Object.fromEntries(new URLSearchParams(raw));
}

function esc(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (ch) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[ch],
  );
}

/** Only in-app paths, never an absolute URL or a protocol-relative one. */
function safeReturnTo(raw, fallback = "/") {
  const value = String(raw ?? "").trim();
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

function normalizeEmail(raw) {
  return String(raw ?? "")
    .trim()
    .toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isLoopbackRequest(req) {
  const address = req?.socket?.remoteAddress;
  return typeof address === "string" && LOOPBACK_ADDRESSES.has(address);
}

/** True for navigations, so we redirect to /login instead of answering 401. */
function wantsHtml(req) {
  const accept = String(req.headers?.accept ?? "");
  return (
    (req.method === "GET" || req.method === "HEAD") &&
    accept.includes("text/html")
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pages
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_CSS = `
:root{color-scheme:light dark;--bg:#0d1117;--card:#161b22;--fg:#e6edf3;--muted:#8b949e;--border:#30363d;--accent:#1f6feb;--danger:#f85149}
@media (prefers-color-scheme:light){:root{--bg:#f6f7f9;--card:#fff;--fg:#1c2024;--muted:#6b7280;--border:#e4e7eb;--accent:#1f6feb}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--bg);color:var(--fg);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.card{width:100%;max-width:420px;background:var(--card);border:1px solid var(--border);border-radius:14px;padding:32px}
.wide{max-width:760px}
h1{margin:0 0 4px;font-size:20px}
p.sub{margin:0 0 24px;color:var(--muted);font-size:14px}
label{display:block;margin:0 0 6px;font-size:13px;font-weight:600}
input{width:100%;padding:10px 12px;margin-bottom:16px;background:var(--bg);color:var(--fg);border:1px solid var(--border);border-radius:8px;font-size:15px}
button{width:100%;padding:11px 16px;border:0;border-radius:8px;background:var(--accent);color:#fff;font-size:15px;font-weight:600;cursor:pointer}
button.secondary{background:transparent;color:var(--fg);border:1px solid var(--border)}
button.link{width:auto;background:none;color:var(--accent);font-weight:400;padding:0;text-decoration:underline}
.sep{display:flex;align-items:center;gap:12px;margin:20px 0;color:var(--muted);font-size:13px}
.sep::before,.sep::after{content:"";flex:1;height:1px;background:var(--border)}
.err{background:rgba(248,81,73,.12);border:1px solid var(--danger);color:var(--danger);padding:10px 12px;border-radius:8px;margin-bottom:20px;font-size:14px}
.ok{background:rgba(63,185,80,.12);border:1px solid #3fb950;color:#3fb950;padding:10px 12px;border-radius:8px;margin-bottom:20px;font-size:14px}
.muted{color:var(--muted);font-size:13px}
table{width:100%;border-collapse:collapse;margin:8px 0 24px}
th,td{text-align:left;padding:8px 6px;border-bottom:1px solid var(--border);font-size:14px}
th{color:var(--muted);font-weight:600;font-size:12px;text-transform:uppercase}
code{background:var(--bg);border:1px solid var(--border);padding:2px 6px;border-radius:5px;font-size:13px;word-break:break-all}
.row{display:flex;gap:8px;align-items:flex-start}
.row input{margin-bottom:0}
.row button{width:auto;white-space:nowrap}
`;

function page({ title, body, wide = false }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(title)}</title><style>${PAGE_CSS}</style></head>
<body><div class="card${wide ? " wide" : ""}">${body}</div></body></html>`;
}

function loginPage({ returnTo, error, notice, googleEnabled, mailerEnabled }) {
  const google = googleEnabled
    ? `<form method="GET" action="${APP_AUTH_API_PREFIX}/google/start">
<input type="hidden" name="returnTo" value="${esc(returnTo)}">
<button class="secondary" type="submit">Continue with Google</button></form>
<div class="sep">or</div>`
    : "";
  const forgot = mailerEnabled
    ? `<p class="muted" style="margin-top:16px"><a href="${APP_AUTH_API_PREFIX}/forgot">Forgot your password?</a></p>`
    : `<p class="muted" style="margin-top:16px">Lost your password? Ask an admin to re-invite you.</p>`;
  return page({
    title: "Sign in · Starship",
    body: `<h1>Starship</h1><p class="sub">Sign in to continue.</p>
${error ? `<div class="err">${esc(error)}</div>` : ""}
${notice ? `<div class="ok">${esc(notice)}</div>` : ""}
${google}
<form method="POST" action="${APP_AUTH_API_PREFIX}/login">
<input type="hidden" name="returnTo" value="${esc(returnTo)}">
<label for="email">Email</label>
<input id="email" name="email" type="email" autocomplete="username" required autofocus>
<label for="password">Password</label>
<input id="password" name="password" type="password" autocomplete="current-password" required>
<button type="submit">Sign in</button></form>${forgot}`,
  });
}

function messagePage({
  title,
  heading,
  message,
  linkHref,
  linkLabel,
  isError,
}) {
  return page({
    title,
    body: `<h1>${esc(heading)}</h1>
<div class="${isError ? "err" : "ok"}">${esc(message)}</div>
${linkHref ? `<p><a href="${esc(linkHref)}">${esc(linkLabel ?? "Continue")}</a></p>` : ""}`,
  });
}

function setPasswordPage({ action, token, heading, sub, error, email }) {
  return page({
    title: `${heading} · Starship`,
    body: `<h1>${esc(heading)}</h1><p class="sub">${esc(sub)}</p>
${error ? `<div class="err">${esc(error)}</div>` : ""}
<form method="POST" action="${esc(action)}">
<input type="hidden" name="token" value="${esc(token)}">
${email ? `<label>Email</label><input value="${esc(email)}" disabled>` : ""}
<label for="password">New password</label>
<input id="password" name="password" type="password" autocomplete="new-password" minlength="${MIN_PASSWORD_LENGTH}" required autofocus>
<label for="confirm">Confirm password</label>
<input id="confirm" name="confirm" type="password" autocomplete="new-password" minlength="${MIN_PASSWORD_LENGTH}" required>
<button type="submit">Save password</button></form>
<p class="muted" style="margin-top:16px">At least ${MIN_PASSWORD_LENGTH} characters.</p>`,
  });
}

function adminTeamPage({ user, mailerEnabled }) {
  return page({
    wide: true,
    title: "Team · Starship",
    body: `<h1>Team</h1><p class="sub">Signed in as ${esc(user.email)} · <a href="${LOGOUT_PATH}">Sign out</a></p>
${mailerEnabled ? "" : `<div class="err">Email is not configured (RESEND_API_KEY unset). Invite links are shown here instead of being emailed.</div>`}
<h2 style="font-size:16px">Members</h2>
<table><thead><tr><th>Email</th><th>Role</th><th>Added</th><th>Last seen</th><th></th></tr></thead><tbody id="users"></tbody></table>

<h2 style="font-size:16px">Invite someone</h2>
<form id="invite-form" class="row" style="margin-bottom:8px">
<input id="invite-email" type="email" placeholder="person@beenex.org" required>
<label style="font-weight:400;display:flex;align-items:center;gap:6px;white-space:nowrap;margin:0">
<input id="invite-admin" type="checkbox" style="width:auto;margin:0"> admin</label>
<button type="submit">Invite</button></form>
<div id="invite-result" class="muted" style="margin-bottom:24px"></div>
<table><thead><tr><th>Pending invite</th><th>Expires</th><th></th></tr></thead><tbody id="invites"></tbody></table>

<h2 style="font-size:16px">Agent &amp; CI tokens</h2>
<p class="muted">Send as <code>Authorization: Bearer &lt;token&gt;</code>. Shown once at creation.</p>
<form id="token-form" class="row" style="margin-bottom:8px">
<input id="token-label" placeholder="playwright-ci" required>
<button type="submit">Create token</button></form>
<div id="token-result" class="muted" style="margin-bottom:8px"></div>
<table><thead><tr><th>Label</th><th>Created</th><th>Last used</th><th></th></tr></thead><tbody id="tokens"></tbody></table>

<script>
const API = ${JSON.stringify(APP_AUTH_API_PREFIX)};
const fmt = (v) => v ? new Date(v).toLocaleString() : "never";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function api(path, options) {
  const res = await fetch(API + path, { credentials: "same-origin", ...options });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || res.statusText);
  return body;
}
async function refresh() {
  const [{ users }, { invites }, { tokens }] = await Promise.all([
    api("/users"), api("/invites"), api("/tokens"),
  ]);
  document.getElementById("users").innerHTML = users.map((u) =>
    '<tr><td>' + esc(u.email) + '</td><td>' + esc(u.role) + '</td><td>' + fmt(u.createdAt) +
    '</td><td>' + fmt(u.lastSeenAt) + '</td><td>' +
    (u.isSelf ? '<span class="muted">you</span>' :
      '<button class="link" data-remove-user="' + esc(u.id) + '">remove</button>') +
    '</td></tr>').join("") || '<tr><td colspan="5" class="muted">No members yet.</td></tr>';
  document.getElementById("invites").innerHTML = invites.map((i) =>
    '<tr><td>' + esc(i.email) + '</td><td>' + fmt(i.expiresAt) +
    '</td><td><button class="link" data-remove-invite="' + esc(i.id) + '">revoke</button></td></tr>').join("")
    || '<tr><td colspan="3" class="muted">No pending invites.</td></tr>';
  document.getElementById("tokens").innerHTML = tokens.map((t) =>
    '<tr><td>' + esc(t.label) + '</td><td>' + fmt(t.createdAt) + '</td><td>' + fmt(t.lastUsedAt) +
    '</td><td><button class="link" data-remove-token="' + esc(t.id) + '">revoke</button></td></tr>').join("")
    || '<tr><td colspan="4" class="muted">No tokens yet.</td></tr>';
}
document.addEventListener("click", async (event) => {
  const el = event.target.closest("[data-remove-user],[data-remove-invite],[data-remove-token]");
  if (!el) return;
  const map = { removeUser: "/users", removeInvite: "/invites", removeToken: "/tokens" };
  const key = Object.keys(map).find((k) => el.dataset[k]);
  if (!key || !confirm("Are you sure?")) return;
  try {
    await api(map[key] + "?id=" + encodeURIComponent(el.dataset[key]), { method: "DELETE" });
    await refresh();
  } catch (err) { alert(err.message); }
});
document.getElementById("invite-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const out = document.getElementById("invite-result");
  out.textContent = "Inviting…";
  try {
    const body = await api("/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: document.getElementById("invite-email").value,
        role: document.getElementById("invite-admin").checked ? "admin" : "member",
      }),
    });
    out.innerHTML = body.delivered
      ? "Invite emailed to " + esc(body.email) + "."
      : "Email not sent (" + esc(body.reason || "unconfigured") + "). Send this link: <code>" + esc(body.inviteUrl) + "</code>";
    document.getElementById("invite-email").value = "";
    document.getElementById("invite-admin").checked = false;
    await refresh();
  } catch (err) { out.textContent = err.message; }
});
document.getElementById("token-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const out = document.getElementById("token-result");
  out.textContent = "Creating…";
  try {
    const body = await api("/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: document.getElementById("token-label").value }),
    });
    out.innerHTML = "Copy it now, it is not shown again: <code>" + esc(body.token) + "</code>";
    document.getElementById("token-label").value = "";
    await refresh();
  } catch (err) { out.textContent = err.message; }
});
refresh().catch((err) => alert(err.message));
</script>`,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// The auth service
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} options
 * @param {NodeJS.ProcessEnv} [options.env]
 * @param {string|null} [options.sessionApiKey] shared agent-server key, used
 *   only for the loopback bypass.
 * @param {string} [options.publicOrigin] origin used to build OAuth redirects.
 * @param {string} [options.basePath] SPA mount path, the default landing spot.
 * @param {boolean} [options.secureCookies] set false for plain-HTTP local runs.
 * @param {string} [options.storePath] override the users/sessions JSON path.
 * @param {string} [options.secretPath] override the signing-secret path.
 * @param {(pathname: string) => boolean} [options.isProxied] whether a path is
 *   forwarded to a backend. Health checks are public only when it is, so an
 *   unproxied one cannot fall through to the SPA shell and leak the key.
 */
export function createAppAuth(options = {}) {
  const env = options.env ?? process.env;
  const sessionApiKey = options.sessionApiKey ?? null;
  const storePath = options.storePath ?? getAppAuthStorePath(env);
  const secretPath = options.secretPath ?? getAppAuthSecretPath(env);
  const basePath = options.basePath ?? "/";
  const secureCookies =
    options.secureCookies ??
    String(env.APP_AUTH_INSECURE_COOKIES ?? "") !== "true";

  const googleClientId =
    String(env.AUTH_GOOGLE_CLIENT_ID ?? "").trim() ||
    String(env.GOOGLE_OAUTH_CLIENT_ID ?? "").trim();
  const googleClientSecret =
    String(env.AUTH_GOOGLE_CLIENT_SECRET ?? "").trim() ||
    String(env.GOOGLE_OAUTH_CLIENT_SECRET ?? "").trim();
  const googleEnabled = Boolean(googleClientId && googleClientSecret);

  const isProxied =
    typeof options.isProxied === "function" ? options.isProxied : () => false;

  const bootstrapEmail = normalizeEmail(env.AUTH_BOOTSTRAP_EMAIL);
  const bootstrapPassword = String(env.AUTH_BOOTSTRAP_PASSWORD ?? "");

  let secret = null;
  let writeLock = Promise.resolve();
  let initPromise = null;
  const failures = new Map();

  function publicOrigin(req) {
    const explicit =
      options.publicOrigin ??
      String(env.APP_AUTH_PUBLIC_ORIGIN ?? "").trim() ??
      "";
    if (explicit) return explicit.replace(/\/+$/, "");
    const host = String(req?.headers?.host ?? "").trim();
    // With secure cookies on, the session and OAuth-nonce cookies only travel
    // over https, so the origin we hand to Google (and therefore the callback
    // it redirects to) must be https too. The upstream proxy has been seen
    // forwarding `x-forwarded-proto: http` for TLS requests; honouring that
    // produced an http callback, the Secure nonce cookie stayed home, and
    // every Google sign-in failed in browsers that do not auto-upgrade to
    // https. Only an explicitly insecure deployment follows the header.
    const forwardedProto = String(req?.headers?.["x-forwarded-proto"] ?? "")
      .split(",")[0]
      .trim();
    const proto = secureCookies ? "https" : forwardedProto || "http";
    if (host) return `${proto}://${host}`;
    return "https://ship.beenex.org";
  }

  const landingPath =
    basePath === "/" ? "/" : `${basePath.replace(/\/+$/, "")}/`;

  // ── store access ──────────────────────────────────────────────────────────

  async function loadStore() {
    return normalizeStore(await readJsonFile(storePath, null));
  }

  async function mutate(mutator) {
    let result;
    const op = async () => {
      const store = await loadStore();
      result = await mutator(store);
      await writeJsonFile(storePath, store);
    };
    writeLock = writeLock.then(op, op);
    await writeLock;
    return result;
  }

  async function loadSecret() {
    const existing = await readFile(secretPath, "utf8").catch((err) => {
      if (err && err.code === "ENOENT") return null;
      throw err;
    });
    const trimmed = String(existing ?? "").trim();
    if (trimmed) return trimmed;
    const generated = randomToken(32);
    await mkdir(path.dirname(secretPath), { recursive: true });
    await writeFile(secretPath, `${generated}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    console.log(`[app-auth] Generated signing secret at ${secretPath}`);
    return generated;
  }

  async function init() {
    secret = await loadSecret();
    await mutate(async (store) => {
      // Prune anything expired so the files do not grow without bound.
      const now = Date.now();
      store.sessions = store.sessions.filter(
        (s) => new Date(s.expiresAt).getTime() > now,
      );
      store.invites = store.invites.filter(
        (i) => new Date(i.expiresAt).getTime() > now,
      );

      if (!bootstrapEmail) return;
      const existing = store.users.find((u) => u.email === bootstrapEmail);
      if (existing) {
        if (existing.role !== "admin") existing.role = "admin";
        return;
      }
      store.users.push({
        id: randomId(),
        email: bootstrapEmail,
        role: "admin",
        passwordHash: bootstrapPassword
          ? await hashPassword(bootstrapPassword)
          : null,
        createdAt: new Date().toISOString(),
        lastSeenAt: null,
        createdBy: "bootstrap",
      });
      console.log(`[app-auth] Bootstrapped admin ${bootstrapEmail}`);
    });
  }

  function ready() {
    if (!initPromise) initPromise = init();
    return initPromise;
  }

  // ── rate limiting ─────────────────────────────────────────────────────────

  function rateKey(req, email) {
    const ip = req?.socket?.remoteAddress ?? "unknown";
    return `${ip}|${email}`;
  }

  function isRateLimited(key) {
    const hits = failures.get(key);
    if (!hits) return false;
    const cutoff = Date.now() - RATE_WINDOW_MS;
    const recent = hits.filter((t) => t > cutoff);
    if (recent.length === 0) {
      failures.delete(key);
      return false;
    }
    failures.set(key, recent);
    return recent.length >= RATE_MAX_FAILURES;
  }

  function recordFailure(key) {
    const cutoff = Date.now() - RATE_WINDOW_MS;
    const recent = (failures.get(key) ?? []).filter((t) => t > cutoff);
    recent.push(Date.now());
    failures.set(key, recent);
  }

  // ── sessions ──────────────────────────────────────────────────────────────

  async function createSession(res, user, req) {
    const sessionId = randomToken(32);
    const now = Date.now();
    await mutate((store) => {
      store.sessions.push({
        id: sessionId,
        userId: user.id,
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
        userAgent: String(req?.headers?.["user-agent"] ?? "").slice(0, 200),
        ip: req?.socket?.remoteAddress ?? null,
      });
      const target = store.users.find((u) => u.id === user.id);
      if (target) target.lastSeenAt = new Date(now).toISOString();
    });
    appendSetCookie(
      res,
      serializeCookie(SESSION_COOKIE, signValue(secret, sessionId), {
        maxAge: Math.floor(SESSION_TTL_MS / 1000),
        secure: secureCookies,
      }),
    );
  }

  function clearSessionCookie(res) {
    appendSetCookie(
      res,
      serializeCookie(SESSION_COOKIE, "", { maxAge: 0, secure: secureCookies }),
    );
  }

  /**
   * Every way an in-container caller presents the shared session key: the
   * header, a bearer, and the query string that the SDK's WebSocket clients
   * use (`websocket-client.js` sends `?session_api_key=`).
   */
  function presentedSessionKeys(req) {
    const keys = [];
    const header = req.headers?.["x-session-api-key"];
    if (typeof header === "string") keys.push(header);
    const authorization = String(req.headers?.authorization ?? "");
    if (authorization.startsWith("Bearer ")) {
      keys.push(authorization.slice(7).trim());
    }
    try {
      const query = new URL(req.url ?? "/", "http://localhost").searchParams;
      const fromQuery = query.get("session_api_key");
      if (fromQuery) keys.push(fromQuery);
    } catch {
      // A malformed URL simply yields no query-string key.
    }
    return keys;
  }

  /**
   * Cookie authority is only honoured for same-origin requests.
   *
   * Preview apps live on `p{port}.beenex.org`, which is the *same site* as
   * `ship.beenex.org` (SameSite compares eTLD+1), and `proxy-utils.mjs`
   * reflects `*.beenex.org` origins with `Allow-Credentials: true`. Without
   * this check an agent-built preview app could ride a signed-in user's
   * cookie. Bearer tokens need no such check: browsers never attach them.
   */
  function isSameOriginRequest(req) {
    const origin = String(req.headers?.origin ?? "").trim();
    if (!origin) return true; // Top-level navigation, or a non-browser client.
    const host = String(req.headers?.host ?? "").trim();
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }

  /**
   * Resolve who is making this request.
   * @returns {Promise<{user: object|null, via: string|null}>}
   */
  async function identify(req) {
    await ready();

    // 1. Loopback + shared key: in-container agents, the automation service and
    //    the sandbox WebSocket clients. Both conditions, never either alone.
    if (
      sessionApiKey &&
      isLoopbackRequest(req) &&
      presentedSessionKeys(req).some((key) => safeEqual(sessionApiKey, key))
    ) {
      return {
        user: { id: "loopback", email: "loopback", role: "service" },
        via: "loopback",
      };
    }

    // 2. Bearer token: agents, CI, Playwright.
    const authorization = String(req.headers?.authorization ?? "");
    if (authorization.startsWith("Bearer ")) {
      const presented = authorization.slice(7).trim();
      if (presented.startsWith(TOKEN_PREFIX)) {
        const hash = sha256(presented);
        const match = await mutate((store) => {
          const token = store.tokens.find((t) => t.hash === hash);
          if (!token) return null;
          token.lastUsedAt = new Date().toISOString();
          return token;
        });
        if (match) {
          return {
            user: {
              id: match.id,
              email: match.label,
              role: match.role === "admin" ? "admin" : "member",
            },
            via: "token",
          };
        }
      }
    }

    // 3. Session cookie — same-origin only, see isSameOriginRequest.
    const cookies = parseCookies(req.headers?.cookie);
    const signed = cookies[SESSION_COOKIE];
    if (signed && isSameOriginRequest(req)) {
      const sessionId = verifySignedValue(secret, signed);
      if (sessionId) {
        const store = await loadStore();
        const session = store.sessions.find((s) => s.id === sessionId);
        if (session && new Date(session.expiresAt).getTime() > Date.now()) {
          const user = store.users.find((u) => u.id === session.userId);
          if (user) return { user, via: "cookie" };
        }
      }
    }

    return { user: null, via: null };
  }

  // ── the gate ──────────────────────────────────────────────────────────────

  function enabled() {
    const explicit = String(env.APP_AUTH_ENABLED ?? "").trim();
    if (explicit === "true") return true;
    if (explicit === "false") return false;
    if (String(env.APP_AUTH_DISABLED ?? "").trim() === "true") return false;
    return Boolean(bootstrapEmail);
  }

  function isPublicPath(pathname) {
    if (PUBLIC_HEALTH_PATHS.has(pathname)) return isProxied(pathname);
    if (PUBLIC_EXACT_PATHS.has(pathname)) return true;
    // GlitchTip webhook uses secret-in-path (no HMAC signing available)
    if (pathname.startsWith("/api/automation/glitchtip-webhook/")) return true;
    if (pathname === APP_AUTH_API_PREFIX) return false;
    if (pathname.startsWith(`${APP_AUTH_API_PREFIX}/`)) {
      return !ADMIN_API_PATHS.has(pathname);
    }
    return false;
  }

  function requiresAdmin(pathname) {
    return ADMIN_API_PATHS.has(pathname) || pathname === ADMIN_TEAM_PATH;
  }

  /**
   * The HTTP gate. Returns true when it has answered the request and the
   * caller must stop; false when the request may continue down the pipeline.
   */
  async function guard(req, res, pathname) {
    if (!enabled()) return false;
    if (isPublicPath(pathname)) return false;

    const { user } = await identify(req);
    if (!user) {
      if (wantsHtml(req)) {
        const returnTo = safeReturnTo(req.url, landingPath);
        redirect(res, `${LOGIN_PATH}?returnTo=${encodeURIComponent(returnTo)}`);
      } else {
        writeJson(res, 401, {
          error: "Authentication required",
          login: LOGIN_PATH,
        });
      }
      return true;
    }

    if (requiresAdmin(pathname) && user.role !== "admin") {
      if (wantsHtml(req)) {
        writeHtml(
          res,
          403,
          messagePage({
            title: "Not allowed · Starship",
            heading: "Admins only",
            message: "Your account does not have admin access.",
            linkHref: landingPath,
            linkLabel: "Back to Starship",
            isError: true,
          }),
        );
      } else {
        writeJson(res, 403, { error: "Admin access required" });
      }
      return true;
    }

    req.appAuthUser = user;
    return false;
  }

  /** WebSocket upgrades: no `res`, so write a raw response and destroy. */
  async function authorizeUpgrade(req, socket) {
    if (!enabled()) return true;
    const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    if (isPublicPath(pathname)) return true;
    const { user } = await identify(req);
    if (user) {
      req.appAuthUser = user;
      return true;
    }
    socket.write(
      "HTTP/1.1 401 Unauthorized\r\n" +
        "Connection: close\r\n" +
        "Content-Length: 0\r\n\r\n",
    );
    socket.destroy();
    return false;
  }

  // ── handlers ──────────────────────────────────────────────────────────────

  async function handleLoginPage(req, res, parsedUrl) {
    await ready();
    const store = await loadStore();
    const { user } = await identify(req);
    if (user) {
      redirect(
        res,
        safeReturnTo(parsedUrl.searchParams.get("returnTo"), landingPath),
      );
      return;
    }
    // A box with no accounts at all would be unreachable; say so plainly
    // instead of showing a login form nobody can pass.
    if (store.users.length === 0) {
      writeHtml(
        res,
        503,
        messagePage({
          title: "Not set up · Starship",
          heading: "No accounts yet",
          message:
            "Set AUTH_BOOTSTRAP_EMAIL in Coolify and restart to create the first admin.",
          isError: true,
        }),
      );
      return;
    }
    writeHtml(
      res,
      200,
      loginPage({
        returnTo: safeReturnTo(
          parsedUrl.searchParams.get("returnTo"),
          landingPath,
        ),
        error: parsedUrl.searchParams.get("error"),
        notice: parsedUrl.searchParams.get("notice"),
        googleEnabled,
        mailerEnabled: isMailerConfigured(env),
      }),
    );
  }

  async function handlePasswordLogin(req, res) {
    await ready();
    const params = await readParams(req);
    const email = normalizeEmail(params.email);
    const password = String(params.password ?? "");
    const returnTo = safeReturnTo(params.returnTo, landingPath);
    const isForm = !String(req.headers["content-type"] ?? "").includes("json");

    const fail = (message, status = 401) => {
      if (isForm) {
        redirect(
          res,
          `${LOGIN_PATH}?returnTo=${encodeURIComponent(returnTo)}&error=${encodeURIComponent(message)}`,
        );
      } else {
        writeJson(res, status, { error: message });
      }
    };

    const key = rateKey(req, email);
    if (isRateLimited(key)) {
      fail("Too many attempts. Try again later.", 429);
      return;
    }

    const store = await loadStore();
    const user = store.users.find((u) => u.email === email);
    const ok =
      user && user.passwordHash
        ? await verifyPassword(password, user.passwordHash)
        : false;
    if (!ok) {
      recordFailure(key);
      fail("Incorrect email or password.");
      return;
    }

    failures.delete(key);
    await createSession(res, user, req);
    if (isForm) redirect(res, returnTo);
    else writeJson(res, 200, { ok: true, email: user.email, role: user.role });
  }

  async function handleLogout(req, res) {
    await ready();
    const cookies = parseCookies(req.headers.cookie);
    const sessionId = verifySignedValue(secret, cookies[SESSION_COOKIE] ?? "");
    if (sessionId) {
      await mutate((store) => {
        store.sessions = store.sessions.filter((s) => s.id !== sessionId);
      });
    }
    clearSessionCookie(res);
    if (wantsHtml(req)) redirect(res, LOGIN_PATH);
    else writeJson(res, 200, { ok: true });
  }

  async function handleMe(req, res) {
    const { user, via } = await identify(req);
    if (!user) {
      writeJson(res, 401, { error: "Authentication required" });
      return;
    }
    writeJson(res, 200, {
      email: user.email,
      role: user.role,
      via,
      admin: user.role === "admin",
    });
  }

  // ── Google OAuth ──────────────────────────────────────────────────────────

  function googleRedirectUri(req) {
    return `${publicOrigin(req)}${APP_AUTH_API_PREFIX}/google/callback`;
  }

  async function handleGoogleStart(req, res, parsedUrl) {
    await ready();
    if (!googleEnabled) {
      redirect(
        res,
        `${LOGIN_PATH}?error=${encodeURIComponent("Google sign-in is not configured.")}`,
      );
      return;
    }
    const nonce = randomToken(16);
    const returnTo = safeReturnTo(
      parsedUrl.searchParams.get("returnTo"),
      landingPath,
    );
    const state = signValue(
      secret,
      Buffer.from(
        JSON.stringify({ n: nonce, rt: returnTo, t: Date.now() }),
      ).toString("base64url"),
    );
    appendSetCookie(
      res,
      serializeCookie(OAUTH_NONCE_COOKIE, nonce, {
        maxAge: Math.floor(OAUTH_STATE_TTL_MS / 1000),
        secure: secureCookies,
      }),
    );
    const url = new URL(GOOGLE_AUTH_URL);
    url.searchParams.set("client_id", googleClientId);
    url.searchParams.set("redirect_uri", googleRedirectUri(req));
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", GOOGLE_SCOPES);
    url.searchParams.set("state", state);
    url.searchParams.set("prompt", "select_account");
    redirect(res, url.toString());
  }

  async function handleGoogleCallback(req, res, parsedUrl) {
    await ready();

    const deny = (message) =>
      writeHtml(
        res,
        403,
        messagePage({
          title: "Sign-in failed · Starship",
          heading: "Could not sign you in",
          message,
          linkHref: LOGIN_PATH,
          linkLabel: "Back to sign in",
          isError: true,
        }),
      );

    if (!googleEnabled) {
      deny("Google sign-in is not configured.");
      return;
    }
    const error = parsedUrl.searchParams.get("error");
    if (error) {
      deny(`Google returned an error: ${error}`);
      return;
    }

    const payload = verifySignedValue(
      secret,
      parsedUrl.searchParams.get("state") ?? "",
    );
    if (!payload) {
      deny("The sign-in request could not be verified. Please try again.");
      return;
    }
    let state;
    try {
      state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    } catch {
      deny("The sign-in request could not be verified. Please try again.");
      return;
    }
    if (!state?.t || Date.now() - state.t > OAUTH_STATE_TTL_MS) {
      deny("The sign-in request expired. Please try again.");
      return;
    }
    const cookies = parseCookies(req.headers.cookie);
    if (
      !safeEqual(
        String(state.n ?? ""),
        String(cookies[OAUTH_NONCE_COOKIE] ?? ""),
      )
    ) {
      deny("The sign-in request could not be verified. Please try again.");
      return;
    }
    appendSetCookie(
      res,
      serializeCookie(OAUTH_NONCE_COOKIE, "", {
        maxAge: 0,
        secure: secureCookies,
      }),
    );

    const code = parsedUrl.searchParams.get("code");
    if (!code) {
      deny("Google did not return an authorization code.");
      return;
    }

    let email = null;
    let emailVerified = false;
    try {
      const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: googleClientId,
          client_secret: googleClientSecret,
          redirect_uri: googleRedirectUri(req),
          grant_type: "authorization_code",
        }),
      });
      if (!tokenResponse.ok) {
        throw new Error(`token exchange failed: ${tokenResponse.status}`);
      }
      const tokens = await tokenResponse.json();
      const userinfo = await fetch(GOOGLE_USERINFO_URL, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (!userinfo.ok) {
        throw new Error(`userinfo failed: ${userinfo.status}`);
      }
      const profile = await userinfo.json();
      email = normalizeEmail(profile.email);
      emailVerified = profile.email_verified === true;
    } catch (err) {
      console.error("[app-auth] Google sign-in failed:", err);
      deny("Could not complete sign-in with Google. Please try again.");
      return;
    }

    if (!email || !emailVerified) {
      deny("Google did not return a verified email address.");
      return;
    }

    // Invite-only: an unknown email never creates an account.
    const user = await mutate((store) => {
      const existing = store.users.find((u) => u.email === email);
      if (existing) {
        existing.lastSeenAt = new Date().toISOString();
        return existing;
      }
      const invite = store.invites.find(
        (i) =>
          i.email === email && new Date(i.expiresAt).getTime() > Date.now(),
      );
      if (!invite) return null;
      const created = {
        id: randomId(),
        email,
        role: invite.role === "admin" ? "admin" : "member",
        passwordHash: null,
        createdAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        createdBy: invite.createdBy ?? "invite",
      };
      store.users.push(created);
      store.invites = store.invites.filter((i) => i.id !== invite.id);
      return created;
    });

    if (!user) {
      deny(
        `${email} has not been invited to this Starship. Ask an admin to invite you.`,
      );
      return;
    }

    await createSession(res, user, req);
    redirect(res, safeReturnTo(state.rt, landingPath));
  }

  // ── invites, accept, reset ────────────────────────────────────────────────

  async function handleInvites(req, res, parsedUrl) {
    await ready();
    const actor = req.appAuthUser;

    if (req.method === "GET") {
      const store = await loadStore();
      const now = Date.now();
      writeJson(res, 200, {
        invites: store.invites
          .filter((i) => new Date(i.expiresAt).getTime() > now)
          .map((i) => ({
            id: i.id,
            email: i.email,
            role: i.role,
            expiresAt: i.expiresAt,
          })),
      });
      return;
    }

    if (req.method === "POST") {
      const params = await readParams(req);
      const email = normalizeEmail(params.email);
      if (!isValidEmail(email)) {
        writeJson(res, 400, { error: "A valid email address is required." });
        return;
      }
      const role = params.role === "admin" ? "admin" : "member";
      const token = randomToken(32);
      const result = await mutate((store) => {
        if (store.users.some((u) => u.email === email)) {
          return { conflict: true };
        }
        store.invites = store.invites.filter((i) => i.email !== email);
        const invite = {
          id: randomId(),
          email,
          role,
          tokenHash: sha256(token),
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
          createdBy: actor?.email ?? "admin",
        };
        store.invites.push(invite);
        return { invite };
      });
      if (result.conflict) {
        writeJson(res, 409, { error: `${email} is already a member.` });
        return;
      }
      const inviteUrl = `${publicOrigin(req)}${APP_AUTH_API_PREFIX}/accept?token=${token}`;
      const delivery = await sendInviteEmail(
        {
          to: email,
          inviteUrl,
          invitedBy: actor?.email ?? null,
          expiresInHours: Math.round(INVITE_TTL_MS / 3_600_000),
        },
        env,
      );
      writeJson(res, 201, {
        email,
        role,
        inviteUrl,
        delivered: delivery.delivered,
        reason: delivery.reason ?? null,
      });
      return;
    }

    if (req.method === "DELETE") {
      const id = parsedUrl.searchParams.get("id");
      await mutate((store) => {
        store.invites = store.invites.filter((i) => i.id !== id);
      });
      writeJson(res, 200, { ok: true });
      return;
    }

    writeJson(res, 405, { error: "Method not allowed" });
  }

  async function handleAccept(req, res, parsedUrl) {
    await ready();
    const action = `${APP_AUTH_API_PREFIX}/accept`;

    if (req.method === "GET") {
      const token = parsedUrl.searchParams.get("token") ?? "";
      const store = await loadStore();
      const invite = store.invites.find(
        (i) =>
          i.tokenHash === sha256(token) &&
          new Date(i.expiresAt).getTime() > Date.now(),
      );
      if (!invite) {
        writeHtml(
          res,
          400,
          messagePage({
            title: "Invite invalid · Starship",
            heading: "This invite is no longer valid",
            message: "It may have expired or already been used.",
            linkHref: LOGIN_PATH,
            linkLabel: "Go to sign in",
            isError: true,
          }),
        );
        return;
      }
      writeHtml(
        res,
        200,
        setPasswordPage({
          action,
          token,
          email: invite.email,
          heading: "Welcome to Starship",
          sub: "Choose a password to finish setting up your account.",
        }),
      );
      return;
    }

    if (req.method !== "POST") {
      writeJson(res, 405, { error: "Method not allowed" });
      return;
    }

    const params = await readParams(req);
    const token = String(params.token ?? "");
    const password = String(params.password ?? "");
    const confirm = String(params.confirm ?? password);
    const store = await loadStore();
    const invite = store.invites.find(
      (i) =>
        i.tokenHash === sha256(token) &&
        new Date(i.expiresAt).getTime() > Date.now(),
    );
    if (!invite) {
      writeHtml(
        res,
        400,
        messagePage({
          title: "Invite invalid · Starship",
          heading: "This invite is no longer valid",
          message: "It may have expired or already been used.",
          linkHref: LOGIN_PATH,
          linkLabel: "Go to sign in",
          isError: true,
        }),
      );
      return;
    }
    const problem =
      password.length < MIN_PASSWORD_LENGTH
        ? `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
        : password !== confirm
          ? "The two passwords do not match."
          : null;
    if (problem) {
      writeHtml(
        res,
        400,
        setPasswordPage({
          action,
          token,
          email: invite.email,
          heading: "Welcome to Starship",
          sub: "Choose a password to finish setting up your account.",
          error: problem,
        }),
      );
      return;
    }

    const passwordHash = await hashPassword(password);
    const user = await mutate((store2) => {
      const current = store2.invites.find((i) => i.id === invite.id);
      if (!current) return null;
      store2.invites = store2.invites.filter((i) => i.id !== invite.id);
      const existing = store2.users.find((u) => u.email === current.email);
      if (existing) {
        existing.passwordHash = passwordHash;
        return existing;
      }
      const created = {
        id: randomId(),
        email: current.email,
        role: current.role === "admin" ? "admin" : "member",
        passwordHash,
        createdAt: new Date().toISOString(),
        lastSeenAt: null,
        createdBy: current.createdBy ?? "invite",
      };
      store2.users.push(created);
      return created;
    });
    if (!user) {
      redirect(
        res,
        `${LOGIN_PATH}?error=${encodeURIComponent("Invite already used.")}`,
      );
      return;
    }
    await createSession(res, user, req);
    redirect(res, landingPath);
  }

  async function handleForgot(req, res) {
    await ready();
    if (req.method === "GET") {
      writeHtml(
        res,
        200,
        page({
          title: "Reset password · Starship",
          body: `<h1>Reset your password</h1><p class="sub">We will email you a reset link.</p>
<form method="POST" action="${APP_AUTH_API_PREFIX}/forgot">
<label for="email">Email</label>
<input id="email" name="email" type="email" autocomplete="username" required autofocus>
<button type="submit">Send reset link</button></form>
<p class="muted" style="margin-top:16px"><a href="${LOGIN_PATH}">Back to sign in</a></p>`,
        }),
      );
      return;
    }
    if (req.method !== "POST") {
      writeJson(res, 405, { error: "Method not allowed" });
      return;
    }

    const params = await readParams(req);
    const email = normalizeEmail(params.email);
    const token = randomToken(32);
    const store = await loadStore();
    const user = store.users.find((u) => u.email === email);
    if (user) {
      await mutate((store2) => {
        const target = store2.users.find((u) => u.id === user.id);
        if (!target) return;
        target.resetTokenHash = sha256(token);
        target.resetExpiresAt = new Date(
          Date.now() + RESET_TTL_MS,
        ).toISOString();
      });
      await sendPasswordResetEmail(
        {
          to: email,
          resetUrl: `${publicOrigin(req)}${APP_AUTH_API_PREFIX}/reset?token=${token}`,
          expiresInHours: Math.round(RESET_TTL_MS / 3_600_000),
        },
        env,
      );
    }
    // Same answer either way: do not reveal who has an account.
    writeHtml(
      res,
      200,
      messagePage({
        title: "Check your email · Starship",
        heading: "Check your email",
        message: `If ${email} has an account, a reset link is on its way.`,
        linkHref: LOGIN_PATH,
        linkLabel: "Back to sign in",
      }),
    );
  }

  async function handleReset(req, res, parsedUrl) {
    await ready();
    const action = `${APP_AUTH_API_PREFIX}/reset`;
    const invalid = () =>
      writeHtml(
        res,
        400,
        messagePage({
          title: "Link invalid · Starship",
          heading: "This reset link is no longer valid",
          message: "It may have expired or already been used.",
          linkHref: `${APP_AUTH_API_PREFIX}/forgot`,
          linkLabel: "Request a new one",
          isError: true,
        }),
      );

    const findUser = async (token) => {
      const store = await loadStore();
      return store.users.find(
        (u) =>
          u.resetTokenHash &&
          u.resetTokenHash === sha256(token) &&
          u.resetExpiresAt &&
          new Date(u.resetExpiresAt).getTime() > Date.now(),
      );
    };

    if (req.method === "GET") {
      const token = parsedUrl.searchParams.get("token") ?? "";
      const user = await findUser(token);
      if (!user) {
        invalid();
        return;
      }
      writeHtml(
        res,
        200,
        setPasswordPage({
          action,
          token,
          email: user.email,
          heading: "Choose a new password",
          sub: "Pick something you have not used here before.",
        }),
      );
      return;
    }

    if (req.method !== "POST") {
      writeJson(res, 405, { error: "Method not allowed" });
      return;
    }

    const params = await readParams(req);
    const token = String(params.token ?? "");
    const password = String(params.password ?? "");
    const confirm = String(params.confirm ?? password);
    const user = await findUser(token);
    if (!user) {
      invalid();
      return;
    }
    const problem =
      password.length < MIN_PASSWORD_LENGTH
        ? `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
        : password !== confirm
          ? "The two passwords do not match."
          : null;
    if (problem) {
      writeHtml(
        res,
        400,
        setPasswordPage({
          action,
          token,
          email: user.email,
          heading: "Choose a new password",
          sub: "Pick something you have not used here before.",
          error: problem,
        }),
      );
      return;
    }

    const passwordHash = await hashPassword(password);
    const updated = await mutate((store) => {
      const target = store.users.find((u) => u.id === user.id);
      if (!target) return null;
      target.passwordHash = passwordHash;
      delete target.resetTokenHash;
      delete target.resetExpiresAt;
      // A password change invalidates every other session.
      store.sessions = store.sessions.filter((s) => s.userId !== target.id);
      return target;
    });
    if (!updated) {
      invalid();
      return;
    }
    await createSession(res, updated, req);
    redirect(res, landingPath);
  }

  // ── users and tokens (admin) ──────────────────────────────────────────────

  async function handleUsers(req, res, parsedUrl) {
    await ready();
    const actor = req.appAuthUser;

    if (req.method === "GET") {
      const store = await loadStore();
      writeJson(res, 200, {
        users: store.users.map((u) => ({
          id: u.id,
          email: u.email,
          role: u.role,
          createdAt: u.createdAt,
          lastSeenAt: u.lastSeenAt ?? null,
          hasPassword: Boolean(u.passwordHash),
          isSelf: u.id === actor?.id,
        })),
      });
      return;
    }

    if (req.method === "DELETE") {
      const id = parsedUrl.searchParams.get("id");
      const result = await mutate((store) => {
        const target = store.users.find((u) => u.id === id);
        if (!target) return { missing: true };
        if (target.id === actor?.id) return { self: true };
        const admins = store.users.filter((u) => u.role === "admin");
        if (target.role === "admin" && admins.length <= 1) {
          return { lastAdmin: true };
        }
        store.users = store.users.filter((u) => u.id !== id);
        store.sessions = store.sessions.filter((s) => s.userId !== id);
        return { ok: true };
      });
      if (result.missing) {
        writeJson(res, 404, { error: "No such member." });
        return;
      }
      if (result.self) {
        writeJson(res, 400, { error: "You cannot remove your own account." });
        return;
      }
      if (result.lastAdmin) {
        writeJson(res, 400, { error: "Cannot remove the last admin." });
        return;
      }
      writeJson(res, 200, { ok: true });
      return;
    }

    writeJson(res, 405, { error: "Method not allowed" });
  }

  async function handleTokens(req, res, parsedUrl) {
    await ready();
    const actor = req.appAuthUser;

    if (req.method === "GET") {
      const store = await loadStore();
      writeJson(res, 200, {
        tokens: store.tokens.map((t) => ({
          id: t.id,
          label: t.label,
          role: t.role,
          createdAt: t.createdAt,
          createdBy: t.createdBy,
          lastUsedAt: t.lastUsedAt ?? null,
        })),
      });
      return;
    }

    if (req.method === "POST") {
      const params = await readParams(req);
      const label = String(params.label ?? "").trim();
      if (!label) {
        writeJson(res, 400, { error: "A label is required." });
        return;
      }
      const token = `${TOKEN_PREFIX}${randomToken(32)}`;
      const record = {
        id: randomId(),
        label,
        role: params.role === "admin" ? "admin" : "member",
        hash: sha256(token),
        createdAt: new Date().toISOString(),
        createdBy: actor?.email ?? "admin",
        lastUsedAt: null,
      };
      await mutate((store) => {
        store.tokens.push(record);
      });
      writeJson(res, 201, { id: record.id, label, token });
      return;
    }

    if (req.method === "DELETE") {
      const id = parsedUrl.searchParams.get("id");
      await mutate((store) => {
        store.tokens = store.tokens.filter((t) => t.id !== id);
      });
      writeJson(res, 200, { ok: true });
      return;
    }

    writeJson(res, 405, { error: "Method not allowed" });
  }

  async function handleAdminTeamPage(req, res) {
    await ready();
    writeHtml(
      res,
      200,
      adminTeamPage({
        user: req.appAuthUser ?? { email: "admin" },
        mailerEnabled: isMailerConfigured(env),
      }),
    );
  }

  /**
   * Route the auth surface. Returns true when it answered the request.
   * Runs after `guard`, so admin paths already have `req.appAuthUser`.
   */
  async function handleRequest(req, res, parsedUrl) {
    const url = parsedUrl ?? new URL(req.url ?? "/", "http://localhost");
    const pathname = url.pathname;

    if (pathname === LOGIN_PATH) {
      await handleLoginPage(req, res, url);
      return true;
    }
    if (pathname === LOGOUT_PATH) {
      await handleLogout(req, res);
      return true;
    }
    if (pathname === ADMIN_TEAM_PATH) {
      await handleAdminTeamPage(req, res);
      return true;
    }
    if (
      pathname !== APP_AUTH_API_PREFIX &&
      !pathname.startsWith(`${APP_AUTH_API_PREFIX}/`)
    ) {
      return false;
    }

    const action = pathname.slice(APP_AUTH_API_PREFIX.length);
    switch (action) {
      case "/login":
        if (req.method !== "POST") break;
        await handlePasswordLogin(req, res);
        return true;
      case "/logout":
        await handleLogout(req, res);
        return true;
      case "/me":
        await handleMe(req, res);
        return true;
      case "/google/start":
        await handleGoogleStart(req, res, url);
        return true;
      case "/google/callback":
        await handleGoogleCallback(req, res, url);
        return true;
      case "/accept":
        await handleAccept(req, res, url);
        return true;
      case "/forgot":
        await handleForgot(req, res);
        return true;
      case "/reset":
        await handleReset(req, res, url);
        return true;
      case "/invites":
        await handleInvites(req, res, url);
        return true;
      case "/users":
        await handleUsers(req, res, url);
        return true;
      case "/tokens":
        await handleTokens(req, res, url);
        return true;
      default:
        break;
    }

    writeJson(res, 404, { error: "Unknown auth endpoint" });
    return true;
  }

  return {
    enabled,
    ready,
    guard,
    handleRequest,
    authorizeUpgrade,
    identify,
    isPublicPath,
    googleEnabled,
    loadStore,
    mutate,
  };
}

---
name: browser-v2
description: >
  Browser skill for Grokbot using Cloudflare Browser Run. Headless Chrome
  sessions via chrome-devtools-mcp connected to the Browser Run API. Logins
  persist: cookies are saved to an encrypted vault and restored into every
  new session.
triggers:
  type: keyword
  keywords:
    - browser
    - browse
    - navigate
    - screenshot
    - web page
    - website
    - inspect page
    - click
    - fill form
    - scrape
---

# Browser V2 — Cloudflare Browser Run (Persistent Logins)

Grokbot uses **Cloudflare Browser Run** for headless browser automation via the `chrome-devtools-mcp` tool. Each Browser Run browser is disposable, but **logins are not**: a cookie vault saves the browser's cookies and loads them into every new session.

## 🎯 Key Capabilities
1. **Headless Chrome on Browser Run:** Each Browser Run session is a fresh Chromium instance. Open tabs do not survive a session ending; cookies do.
2. **chrome-devtools-mcp Integration:** The agent controls the browser through MCP tools (`navigate_page`, `take_screenshot`, `click`, `fill`, `evaluate_script`, etc.).
3. **Persistent logins:** Cookies are saved to an encrypted vault on the durable disk a few seconds after browser activity and when the browser closes, then restored before the first page load of every new session — across conversations, the ~10-minute idle timeout, Cloudflare restarts, and container redeploys.
4. **10-Minute Idle Timeout:** Browser Run sessions close after ~10 minutes of inactivity. The next browser action opens a new session with the saved logins already in it.
5. **Container App Previews:** To browse apps running inside the container, use `pNNNN.beenex.org` (the public preview URL), not `localhost:PORT`.

---

## 🚫 BANNED PRACTICES (Do NOT do these)
- ❌ Do NOT run `chromium`, `google-chrome`, or any headless browser via bash — the binary is DISABLED and will error.
- ❌ Do NOT run `pip install playwright`, `pip install selenium`, or `npm install puppeteer`.
- ❌ Do NOT write custom Python/Node.js scripts to automate browsers.
- ❌ Do NOT write your own cookie export/import — the vault already does it. Never print, copy, or export cookie values or the vault files.
- ❌ Do NOT try to bypass CAPTCHAs or MFA with custom scripts.
- ❌ Do NOT use `localhost:PORT` when browsing container apps via Browser Run — use `pNNNN.beenex.org`.

---

## 🧭 Workflow

### Scenario A: Public Web Browsing & Scraping
1. Use `navigate_page` to go to the URL.
2. Use `take_screenshot` or `take_snapshot` to capture the page state.
3. Use `click`, `fill`, `evaluate_script` as needed.

### Scenario B: Browsing Container Apps
1. Start your app on a port (e.g., `npm start` on port 3000).
2. Navigate Browser Run to `https://p3000.beenex.org` (NOT `localhost:3000`).
3. The preview URL is public and accessible from Browser Run's external Chromium.

### Scenario C: Authentication Required
1. Navigate to the site first — it may already be signed in from an earlier conversation.
2. If not, log in with the tools (`fill`, `click`). After the login completes, take one more action (e.g. `take_snapshot`) so the new cookies are saved.
3. For MFA, SSO prompts, or CAPTCHAs, ask the user to finish the login themselves: Cloudflare dashboard → Browser Run → **Live Sessions** → open the live session. Continue once they confirm, then take a snapshot so the login is saved.
4. Some sites (Google, banks) may still sign the browser out, because Browser Run is identified as bot traffic and its IP changes. Prefer API access (tokens, keys) where the site offers it.
5. Pages opened with `isolatedContext` start logged out and their cookies are not saved. Use them only when you need a clean, signed-out browser.

### Managing saved logins
- `cf-browser-vault list` — sites with saved cookies (counts only, never values).
- `cf-browser-vault clear <domain>` — sign the browser out of one site (e.g. `github.com`, including subdomains).
- `cf-browser-vault clear` — forget every saved login.
- A browser session that is already open keeps its cookies until it closes.

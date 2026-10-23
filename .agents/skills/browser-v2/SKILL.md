---
name: browser-v2
description: >
  Browser skill for Grokbot using Cloudflare Browser Run. Ephemeral headless
  Chrome sessions via chrome-devtools-mcp connected to the Browser Run API.
  No persistent cookies or MFA handoff — each session starts fresh.
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

# Browser V2 — Cloudflare Browser Run (Ephemeral Sessions)

Grokbot uses **Cloudflare Browser Run** for headless browser automation via the `chrome-devtools-mcp` tool. Each session is ephemeral — there are no persistent cookies, logins, or profiles.

## 🎯 Key Capabilities
1. **Ephemeral Headless Chrome:** Each Browser Run session spins up a fresh Chromium instance. Sessions are disposable and carry no state between runs.
2. **chrome-devtools-mcp Integration:** The agent controls the browser through MCP tools (`navigate_page`, `take_screenshot`, `click`, `fill`, `evaluate_script`, etc.).
3. **10-Minute Idle Timeout:** Browser Run sessions automatically close after ~10 minutes of inactivity. If you need a longer session, perform periodic actions to keep it alive.
4. **Container App Previews:** To browse apps running inside the container, use `pNNNN.beenex.org` (the public preview URL), not `localhost:PORT`.

---

## 🚫 BANNED PRACTICES (Do NOT do these)
- ❌ Do NOT run `chromium`, `google-chrome`, or any headless browser via bash — the binary is DISABLED and will error.
- ❌ Do NOT run `pip install playwright`, `pip install selenium`, or `npm install puppeteer`.
- ❌ Do NOT write custom Python/Node.js scripts to automate browsers.
- ❌ Do NOT attempt to persist cookies or sessions across Browser Run invocations.
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
Since sessions are ephemeral, there is no persistent login state.
1. If the target requires auth, check if API-based access is possible instead.
2. For sites needing interactive login, inform the user that Browser Run cannot persist auth and suggest alternatives (API keys, tokens, etc.).

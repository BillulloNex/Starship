---
name: browser-v2
description: >
  Unified collaborative browser skill for Grokbot on the dedicated Browser VM.
  Controls the live persistent headed Chrome instance via remote CDP, supports
  seamless human-in-the-loop co-navigation, persistent multi-session logins,
  and real-time MFA/SSO handoff without restarting or switching browser engines.
triggers:
  type: keyword
  keywords:
    - browser
    - browse
    - login
    - sign in
    - sign-in
    - signin
    - log in
    - log-in
    - authenticate
    - authentication
    - SSO
    - MFA
    - 2FA
    - two-factor
    - OTP
    - CAPTCHA
    - OAuth
    - authentication required
    - access denied
    - 403
    - 401
    - unauthorized
    - forbidden
    - password
    - credential
    - credentials
    - library
    - EBSCO
    - microsoftonline
    - okta
    - auth0
    - accounts.google
    - pick an account
    - verify your identity
    - device verification
---

# Browser V2 — Unified Collaborative Browser

Grokbot uses a **dedicated persistent Browser VM** where both the Agent and the Human share the **exact same headed Google Chrome browser** in real-time.

## 🎯 Key Capabilities
1. **Persistent Authentication:** Cookies, logins, extensions, and sessions persist permanently across conversations on `/data/chrome-profile`.
2. **Dual-Channel Co-Navigation:**
   - You (Agent) control the page via browser tools / CDP.
   - The user watches live in the **Interactive Browser** tab.
3. **Frictionless Human Handoff (MFA / 2FA / CAPTCHA):**
   - No restarting, no profile locks, no cookie extraction needed.
   - When a security challenge or MFA appears, simply notify the user to complete it in the Interactive tab, wait for confirmation, and immediately continue navigating on the same tab!

---

## 🚫 BANNED PRACTICES (Do NOT do these)
- ❌ Do NOT run `pip install playwright`, `pip install selenium`, or `npm install puppeteer`.
- ❌ Do NOT run headless chromium locally (`chromium --headless`) for authenticated websites.
- ❌ Do NOT try to bypass CAPTCHAs or MFA with custom Python scripts.
- ❌ Do NOT tell the user to reset their passwords or lecture them about security.

---

## 🧭 Workflow & Human Handoff Procedure

### Scenario A: Routine Browsing & Public Web
1. Use standard browser actions to navigate, read content, extract data, or interact with web apps.
2. The user sees the live results in the **Browser** panel.

### Scenario B: Authentication & SSO / MFA Challenges
When encountering any sign-in prompt, Microsoft/Google SSO, Okta, Cloudflare Turnstile, CAPTCHA, or 2FA:
1. Navigate to the login page.
2. If the user provided credentials, input them directly.
3. **If MFA, 2FA prompt, CAPTCHA, or biometric verification appears:**
   Tell the user:
   > "I've navigated to the login page and reached the verification/MFA challenge. Please complete the prompt in the **Interactive** browser tab, and tell me when you're logged in."
4. **Pause and wait for the user to respond.**
5. Once the user replies that they are logged in, inspect the current page / URL and continue your task immediately.
6. The session is saved to the persistent profile and will remain logged in for future requests.

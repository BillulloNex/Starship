---
name: auth-handoff
description: >
  Handle websites requiring authentication (SSO, MFA, OAuth) by starting
  an interactive VNC browser session and guiding the user through login.
  Triggers on: login, sign in, authenticate, SSO, MFA, library search,
  EBSCO, authentication required, 403, access denied.
triggers:
  type: keyword
  keywords:
    - login
    - sign in
    - authenticate
    - SSO
    - MFA
    - authentication required
    - access denied
    - library
    - EBSCO
---

# Auth Handoff Skill

When the agent encounters a website that requires authentication (SSO login,
Microsoft sign-in, Google OAuth, MFA/2FA), it cannot complete the login flow
autonomously. This skill defines the **auth handoff protocol** — a collaborative
pattern where the agent starts an interactive browser, the user completes login,
and the agent resumes with the authenticated session.

## Detection

Recognise an auth wall when any of these are true:

- Page contains "Sign in", "Log in", "Pick an account", or similar
- HTTP response is 401 or 403
- URL redirects to a known SSO provider (login.microsoftonline.com,
  accounts.google.com, auth0, okta, etc.)
- Page shows a username/password form the agent shouldn't fill
  (especially when MFA/2FA is likely)

## Protocol

### Step 1 — Detect & Navigate

When you detect an auth wall on a page you need to access:

1. Note the URL that requires authentication.
2. If not already on the auth page, navigate to it using browser tools so the
   session state is captured.

### Step 2 — Start Interactive Browser

Run the VNC browser on-demand:

```bash
start-vnc-browser start "<auth-url>"
```

This starts Xvfb + Chromium + VNC + noVNC. The Chromium instance uses the same
persistent cookie profile as your browser tools, so any login completed there
will be available to you afterward.

### Step 3 — Guide the User

Tell the user:

> I've hit a login page at **[URL]**. I've started an interactive browser
> session for you.
>
> **To complete the login:**
> 1. Switch to the **Interactive** tab in the Browser panel (the hand icon)
> 2. Complete the sign-in / MFA flow in the live browser
> 3. Once you're logged in, come back here and tell me to continue
>
> Your login session will be saved and I'll be able to use it for the rest
> of this conversation.

Then **stop and wait** for the user to confirm they've logged in. Do NOT
proceed until the user explicitly tells you to continue.

### Step 4 — Resume with Authenticated Session

After the user confirms:

1. Stop the VNC browser to release the profile lock:
   ```bash
   start-vnc-browser stop
   ```
2. Resume your task using the standard browser tools (`browser_navigate`,
   `browser_click`, `browser_get_content`, etc.). The cookies from the user's
   login are now in the persistent Chrome profile and will be used automatically.
3. Verify you have access by navigating to the original target URL and checking
   that the auth wall is gone.

### Step 5 — Handle Failures

If the user reports they couldn't log in, or if the session doesn't persist:

- Check `start-vnc-browser status` to verify the VNC stack is healthy
- Suggest the user try opening the VNC URL in a new browser tab (the "Open in
  New Tab" button in the Interactive panel)
- If cookies don't persist, the Chrome profile directory may be locked — ensure
  the VNC browser is stopped before using regular browser tools

## Important Notes

- **Never fill in passwords yourself.** Always hand off to the user for auth.
- **Cookies persist across conversations.** Once a user logs into a site, future
  conversations can access it without re-authentication (until the session
  expires).
- **Security:** The VNC browser is accessible via the preview URL pattern
  (e.g., `p6080.beenex.org`). It's public — warn the user not to leave
  sensitive sessions open longer than needed.
- **On-demand only:** The VNC stack is NOT always running. Start it when needed,
  stop it when done, to conserve container resources.

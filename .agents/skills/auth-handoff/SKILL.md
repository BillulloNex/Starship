---
name: auth-handoff (DEPRECATED)
description: >
  [DEPRECATED / SUPERSEDED by browser-v2]
  Legacy browser auth skill retained for reference only.
triggers:
  type: manual
  keywords: []
---

# [DEPRECATED] Auth Handoff Skill (Superseded by browser-v2)

> **NOTE:** This skill has been superseded by `browser-v2` which uses the unified collaborative Browser VM stack. Retained for historical reference.


When the agent encounters a website that requires authentication, follow
this two-phase approach.

## Phase 1 — Try Programmatic Login First

If the user has provided login credentials (email, password, etc.):

1. Use browser tools (`browser_navigate`, `browser_type`, `browser_click`)
   to fill in the login form and submit
2. Check the result
3. If login succeeds → continue with the authenticated session. Done!
4. If login fails or you hit MFA/2FA, CAPTCHA, or "Pick an account" →
   proceed to Phase 2

## Phase 2 — VNC Handoff (for MFA/2FA or when login fails)

### Step 1 — Start Interactive Browser

Run the VNC browser on-demand:

```bash
start-vnc-browser start "<auth-url>"
```

This starts Xvfb + Chromium + VNC + noVNC. The Chromium instance uses the same
persistent cookie profile as your browser tools, so any login completed there
will be available to you afterward.

### Step 2 — Guide the User

Tell the user:

> I've hit an MFA/verification step I can't complete automatically. I've
> started an interactive browser session for you.
>
> **To complete the login:**
> 1. Switch to the **Interactive** tab in the Browser panel (the hand icon)
> 2. Complete the verification / MFA flow in the live browser
> 3. Once you're logged in, come back here and tell me to continue

Then **stop and wait** for the user to confirm.

### Step 3 — Resume with Authenticated Session

After the user confirms:

1. Stop the VNC browser to release the profile lock:
   ```bash
   start-vnc-browser stop
   ```
2. Resume your task using the standard browser tools. The cookies from the
   user's login are now in the persistent Chrome profile.
3. Verify you have access by navigating to the original target URL.

## Important Notes

- **If the user provides credentials, USE THEM** to attempt login first.
- **Only hand off to the user when you genuinely can't proceed** (MFA,
  CAPTCHA, device verification, etc.)
- **Never install puppeteer, selenium, or playwright manually.** Use your
  built-in browser tools or `start-vnc-browser` instead.
- **Cookies persist across conversations** via
  `/home/openhands/.openhands/chrome-profile`.
- **On-demand only:** Start VNC when needed, stop when done.

# INC-019-001: Automation Dashboard 401 — Stale Backend Origin

**Date**: 2026-09-01  
**Severity**: P2 (user-facing, self-recoverable)  
**Duration**: ~15 min (transient)  
**Affected**: Automation Dashboard on `ship.beenex.org`

---

## Symptoms

- Red toast: `Request failed with status code 401`
- Automation Dashboard: `Failed to load automations` with Retry button
- DevTools console: 401s on `https://grok-api.beenex.org/api/automation/v1/*`
- Secondary: `/health` tab showed Cloudflare "DNS points to prohibited IP" (transient)

## Root Cause

**Stale `openhands-backends` localStorage entry.** The browser had a cached backend pointing to `grok-api.beenex.org` (from when the frontend was served via `grokbot.pages.dev`), but the user was browsing `ship.beenex.org`.

The chain:
1. `getAgentServerBaseUrl()` in [`agent-server-config.ts:188-192`](file:///Users/thomasthemaker/Development/ComfySpace/playground/Starship/OpenHands/src/api/agent-server-config.ts#L188-L192) hardcodes `grok-api.beenex.org` for `grokbot.pages.dev` origins
2. At some earlier session, the backend was seeded with `host: "https://grok-api.beenex.org"`
3. The `syncLauncherDefaultLocalBackend()` in [`storage.ts:77-85`](file:///Users/thomasthemaker/Development/ComfySpace/playground/Starship/OpenHands/src/api/backend-registry/storage.ts#L77-L85) migrates `grok.beenex.org` → `grok-api.beenex.org`, but does NOT migrate `grok-api.beenex.org` → `ship.beenex.org`
4. Automation API calls via `localAutomationAxios` resolve the backend from `getEffectiveLocalBackend()`, which returns the stale `grok-api.beenex.org` entry
5. The `X-Session-API-Key` injected by `static-server.mjs` is for `ship.beenex.org`'s session — cross-origin requests to `grok-api.beenex.org` either don't attach it or the automation backend rejects it as invalid for that origin context

**Contributing factor**: A container restart (~9 min before investigation) caused transient 502s on `/api/settings`, which may have prevented the frontend from properly initializing the backend registry on page load.

## Resolution

```js
// Run in browser DevTools console:
localStorage.removeItem('openhands-backends');
location.reload();
```

This forces the frontend to re-seed the default backend from `window.location.origin` (`https://ship.beenex.org`) with the correct injected API key.

## Key Files

| File | Role |
|------|------|
| [`agent-server-config.ts`](file:///Users/thomasthemaker/Development/ComfySpace/playground/Starship/OpenHands/src/api/agent-server-config.ts) | `getAgentServerBaseUrl()` — origin → backend URL mapping |
| [`storage.ts`](file:///Users/thomasthemaker/Development/ComfySpace/playground/Starship/OpenHands/src/api/backend-registry/storage.ts) | `syncLauncherDefaultLocalBackend()` — migration logic |
| [`automation-service.api.ts`](file:///Users/thomasthemaker/Development/ComfySpace/playground/Starship/OpenHands/src/api/automation-service/automation-service.api.ts) | `localAutomationAxios` interceptor — resolves backend host + API key |
| [`default-backend.ts`](file:///Users/thomasthemaker/Development/ComfySpace/playground/Starship/OpenHands/src/api/backend-registry/default-backend.ts) | `makeDefaultLocalBackend()` — seeds backend on first load |
| [`entrypoint.sh`](file:///Users/thomasthemaker/Development/ComfySpace/playground/Starship/OpenHands/docker/entrypoint.sh) | Session API key generation + injection into static-server |

## Diagnostic Checklist

When automation dashboard shows 401:

1. **Check which host the requests go to** — DevTools Network tab, filter `automation`. If the host ≠ `window.location.origin`, it's a stale backend entry.
2. **Check localStorage**: `JSON.parse(localStorage.getItem('openhands-backends'))` — verify `host` matches current origin.
3. **Check API key match**: `curl -H "X-Session-API-Key: <key_from_localStorage>" https://<host>/api/automation/health` — if 401, key mismatch.
4. **Check backend health**: `curl https://ship.beenex.org/health` — if 502/timeout, container is down or restarting.

## Prevention (TODO)

- [ ] Add migration in `syncLauncherDefaultLocalBackend()` to also migrate `grok-api.beenex.org` → current `window.location.origin` when they differ
- [ ] Consider always overwriting the default-local backend host on page load when the stored host ≠ `getAgentServerBaseUrl()`, not just for the `grok.beenex.org` → `grok-api.beenex.org` case
- [ ] Add a user-facing warning when the stored backend host doesn't match the page origin

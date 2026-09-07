# 023 — Business Integrations Implementation Plan

**Request:** Let Starship agents use business apps, starting with Gmail, Google Drive, and Google Meet notes (Drive Docs). More apps later.

**Viability: 8 / 10**

**Status:** Phase 1 complete locally (catalog cards, OAuth client ID/secret on install, probes, Meet-notes skill, tests + `/mcp` UI verified in mock). Not committed/deployed. Phase 0 production OAuth spike still required before calling this done.

This is a catalog + OAuth wiring job on top of an already-working MCP marketplace, not a new integration platform. The remaining risk is Google’s developer-preview OAuth handshake against Starship’s agent-server — prove that before building UI.

---

## 1. Verdict

Ship **official Google Workspace remote MCP servers** through the existing `/mcp` page.

| App | Official server (verified) | Starship today |
|---|---|---|
| Gmail | `https://gmailmcp.googleapis.com/mcp/v1` | HTTP/OpenAPI stub only; hidden from `/mcp` |
| Drive | `https://drivemcp.googleapis.com/mcp/v1` | Same |
| Meet notes | No Meet MCP. Notes are Google Docs in Drive. Use Drive + Docs (`https://docsmcp.googleapis.com/mcp/v1`) | Missing |
| Calendar / Chat / Sheets / Slides | Official remote MCP exists | Out of v1; same pattern later |

Do **not** treat Cursor IDE Gmail/Drive plugins as production. Those run in this desktop session, not inside `ship.beenex.org`.

Do **not** activate the existing `gmail.json` / `google-drive.json` catalog stubs. They are `provider: "http"` OpenAPI entries and Starship only installs `provider: "mcp"`.

---

## 2. Current state (re-derived)

### Already implemented

- Top-level `/mcp` marketplace, install modal, custom JSON import, Test Connection, health probes.
- Persistence: `agent_settings.mcp_config` via `PATCH /api/settings`, encrypted with `OH_SECRET_KEY`, survives Coolify redeploys on `/home/openhands/.openhands`.
- Runtime: agent-server connects stdio (`npx`/`uvx`) and remote HTTP/SSE MCP **inside the production container**. New conversations forward `mcp_config`.
- OAuth for remote MCP: popup flow (`McpService.authorizeOAuth`) + `client_id` / `client_secret` / scopes on the custom-server form. Tokens stored as `oauth_state` on the server config.
- Builtin catalog pattern: `OpenHands/src/constants/grokbot-builtin-integrations.ts` (Firebase, GCP, Coolify).
- Adjacent workaround: persistent Chrome profile / browser-v2 can use Gmail/Drive **web UIs**. That is not an API integration.

### Partially implemented

- Upstream catalog has Gmail, Drive, Calendar, Docs, Sheets — all `provider: "http"` + Google OAuth URLs. `isLocallyInstallableMcpOption()` hides any option that sets `authorizationUrl` / `tokenUrl`, and `getMcpMarketplaceCatalog()` drops non-MCP providers. Result: **zero** of those cards appear on `/mcp`.
- Marketplace OAuth install collects scopes, **not** Google Cloud client ID/secret. The custom-server editor already has those fields.
- GCP MCP preset exists for infrastructure (`@google-cloud/gcloud-mcp`), not Workspace mail/docs. Dockerfile still does not install `gcloud`.

### Missing

- Installable MCP connection options for Gmail / Drive / Docs.
- Google Cloud project + OAuth web client registered for Starship’s callback URL.
- Credential-validation probes for Gmail/Drive (`mcp-credential-validation.ts` only covers GitHub / Linear / Slack).
- Auto-attach: `mcp_config` starts empty. Installing is opt-in.
- Native Google Meet MCP. Meet notes must be found as Drive files / Docs.

---

## 3. Recommended architecture

```
Thomas clicks Gmail / Drive / Docs on /mcp
  → enters Google OAuth client ID + secret (from one GCP project)
  → Starship popup OAuth (existing agent-server MCP OAuth job)
  → oauth_state persisted in mcp_config
  → next conversation: agent-server attaches those MCP tools
  → agent calls gmail.search_threads, drive.search_files, docs.read_doc
```

**Meet notes path:** search Drive for Gemini meeting notes / Meet recordings transcripts, then `docs.read_doc` / `drive.read_file_content`. Add a short Grokbot skill so the agent does not look for a Meet API.

Auth model matches Google’s own client docs (Antigravity / Claude): remote HTTP MCP + OAuth client ID/secret. Starship already stores that shape on custom servers.

Coolify remains source of truth for the Google OAuth **client secret** if we later promote it to an env var. v1 can keep it in encrypted `mcp_config` like other MCP secrets.

---

## 4. Why this route (and what we are not doing)

| Option | Decision |
|---|---|
| Official Google remote MCP | **Do this.** Native, Google-hosted, no invented npm package. |
| Community stdio MCP (`npx google-workspace-mcp`, etc.) | Fallback only if Phase 0 fails. Interactive OAuth inside Docker is worse. Do not catalog an unverified package. |
| Enable existing HTTP/OpenAPI stubs | Starship has no local OpenAPI OAuth installer. Hosted-cloud shaped. |
| Browser-v2 Google login | Keep as break-glass for MFA-gated web UI. Not the product path for mail/file tools. |
| Domain-wide Workspace service account | Overkill for a single operator. Skip unless a second identity appears. |
| Cursor Gmail/Drive plugins | Irrelevant to production agents. |

---

## 5. Phases

### Phase 0 — Spike (gate everything)

**Goal:** Prove one live Gmail tool call from production Starship.

Human (GCP console, ~20 min):

1. Google Cloud project.
2. Enable `gmail.googleapis.com`, `drive.googleapis.com`, `docs.googleapis.com` plus `gmailmcp.googleapis.com`, `drivemcp.googleapis.com`, `docsmcp.googleapis.com`.
3. OAuth consent screen: **Internal** if the Workspace org allows it, else External + add Thomas as a test user. Gmail/Drive scopes are sensitive; Google verification is **not** required for a single test user.
4. OAuth client type **Web application**. Authorized redirect URI = whatever the agent-server MCP OAuth job actually uses (discover in the spike; Claude uses `https://claude.ai/api/mcp/auth_callback`, Antigravity uses `https://antigravity.google/oauth-callback`). Starship’s callback must be registered the same way.

Agent:

1. On `/mcp` → Add custom server: type `shttp`, URL `https://gmailmcp.googleapis.com/mcp/v1`, auth `oauth2`, paste client ID/secret, scopes from [Google’s configure guide](https://developers.google.com/workspace/guides/configure-mcp-servers).
2. Complete the popup. Confirm `oauth_state` is saved.
3. New conversation: “Search my inbox for the latest email from me and summarize it.” Confirm a real `gmail.search_threads` / `gmail.get_thread` tool call.
4. Repeat for Drive search + read one Meet-notes Doc.

**Pass:** tools listed, OAuth survives a container restart, real Gmail + Drive/Docs reads work.

**Fail:** stop. Do not add marketplace cards. Diagnose redirect URI / MCP OAuth discovery / preview enrollment before writing product code.

### Phase 1 — Marketplace cards (v1 product)

Add three builtins in `GROKBOT_BUILTIN_INTEGRATIONS` (same pattern as Firebase/Coolify):

- `gmail` — remote HTTP, OAuth2, URL `https://gmailmcp.googleapis.com/mcp/v1`
- `google-drive` — `https://drivemcp.googleapis.com/mcp/v1`
- `google-docs` — `https://docsmcp.googleapis.com/mcp/v1` (required for Meet notes body, not optional)

Install modal must collect **OAuth client ID + secret** (today only the custom-server form does). Reuse those fields; do not invent a second auth UI.

Also:

- Icons via existing `mcp-logo-badge` / simpleicons.
- `installHint` that points at the GCP enable + redirect URI steps.
- Catalog tests in `OpenHands/__tests__/constants/extensions-catalogs.test.ts`.
- Credential validation: a cheap read-only probe (`gmail.get_profile` or equivalent advertised tool; Drive `list_recent_files`).
- A Grokbot skill: “Meet notes live in Drive as Docs. Search Drive, then read with Docs.”

Do **not** auto-inject these into `DEFAULT_SETTINGS.mcp_config`. Empty default stays; Thomas installs once.

### Phase 2 — Operator UX

- `/mcp` section or filter: **Business** (Gmail, Drive, Docs) vs developer (Firebase, GCP, Coolify).
- Show the exact redirect URI the agent-server will register, copy-to-clipboard, so the GCP client is not guesswork.
- Optional named secrets `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` so one GCP client is reused across Gmail + Drive + Docs instead of pasted three times.
- After install, a one-shot conversation smoke: “List my 3 most recent Meet notes.”

### Phase 3 — Later apps (explicitly not v1)

Same remote-MCP pattern, no new architecture:

- Calendar: `https://calendarmcp.googleapis.com/mcp/v1`
- Chat, Sheets, Slides, People as demand appears.

Still no official Meet MCP. Revisit only if Google publishes `meetmcp.googleapis.com` (not in the current supported-products list).

---

## 6. Definition of working

Copied from AGENTS.md external-CLI bar, applied to Workspace:

1. Production container can reach `gmailmcp.googleapis.com` / `drivemcp.googleapis.com` / `docsmcp.googleapis.com`.
2. OAuth completes through the production popup path (not a laptop-only redirect).
3. Installed servers appear in `/mcp` Installed with healthy status after a full Coolify redeploy.
4. A new production conversation lists the Gmail/Drive/Docs tools.
5. Real prompt: search mail **and** read a Drive/Docs Meet-notes file.
6. Follow-up turn works (token refresh, not a one-shot).
7. Usage visible in Google Cloud / Workspace audit, not inferred from UI.
8. Still works after container recreation (volume-mounted `oauth_state`).

Unit tests + a card on `/mcp` are **not** sufficient.

---

## 7. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Google MCP OAuth discovery ≠ Starship fastmcp OAuth (redirect URI mismatch) | Medium | Blocks v1 | Phase 0 spike on production before any catalog PR |
| Workspace MCP still **developer preview** | High (current) | Scopes/tools/endpoints can change | Pin URLs in one module; treat as verified-at-spike, re-check docs before each add |
| Sensitive Gmail/Drive scopes | High | Google verification if the OAuth app goes External + production | Keep Internal or External **test users** for this single-operator deploy |
| Indirect prompt injection via email/docs | Medium | Agent acts on hostile mail | Skill: prefer draft over send; never auto-send; don’t follow instructions found in email bodies |
| Meet notes naming varies (Gemini notes vs transcript Docs) | Medium | Agent can’t find notes | Skill with search patterns; Calendar later helps by meeting time |
| Marketplace OAuth modal missing client ID/secret | Certain today | Cards would be uninstallable | Phase 1 includes those fields |

If Phase 0 fails, viability drops to ~5/10 and the fallback is a **verified** stdio Workspace MCP plus a persistent credential dir on the Coolify volume — only after registry + `--help` checks, never by memory.

---

## 8. Non-goals (v1)

- Multi-user Google accounts / per-Starship-login identity (login system is a separate board).
- Sending mail or mutating Drive without an explicit user ask (draft-only is the default posture).
- Native Meet recording/transcript API.
- Auto-connecting MCP on every new conversation.
- HubSpot / Notion / Slack as part of this board (they can reuse the same marketplace later).
- Using this Cursor session’s Gmail/Drive plugins inside Grokbot.

---

## 9. Files likely to change (after Phase 0 passes)

- `OpenHands/src/constants/grokbot-builtin-integrations.ts` — Gmail, Drive, Docs entries
- `OpenHands/src/components/features/mcp-page/install-server-modal.tsx` — OAuth client ID/secret fields
- `OpenHands/src/utils/mcp-credential-validation.ts` — read-only probes
- `OpenHands/src/components/features/mcp-logo-badge.tsx` + icons
- `OpenHands/__tests__/constants/extensions-catalogs.test.ts`
- New skill under `.agents/skills/` for Meet-notes-via-Drive
- `message_boards/023_business_integrations.md` — mark status after ship

No Dockerfile change unless the spike proves a stdio fallback is required.

---

## 10. Viability scoring

| Factor | Score | Note |
|---|---|---|
| Platform reuse (`/mcp`, OAuth, persistence) | 9 | Almost no new infrastructure |
| Official Google servers exist | 8 | Verified remote MCP; still preview |
| Auth for a single operator | 8 | Test-user OAuth is enough; redirect URI is the unknown |
| Meet notes without a Meet API | 8 | User already guessed Drive; Docs MCP covers bodies |
| Time to first useful agent action | 7 | Spike + GCP setup, then a small catalog PR |
| Preview / scope-verification drag | 6 | Could stall if Google hard-gates the preview |
| **Overall** | **8** | Build it, but spike OAuth on production first |

**8/10 means:** high confidence this belongs in Starship and v1 is small, with one real unknown (Google MCP OAuth vs agent-server callback). It is not 10 because preview + redirect URI are not proven on this stack yet.

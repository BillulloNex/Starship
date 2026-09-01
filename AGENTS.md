# AGENTS.md — Grokbot

This file is the index of durable rules for any agent (human or AI) working in this repo. Keep it concise; move long detail into daily logs.

## Agent Permissions & Direct Pushes (MANDATORY)

- **AI agents are fully authorized and encouraged to make changes, commit, and push directly to GitHub (including the `main` branch).**
- There are no restrictions prohibiting agents from committing or pushing directly to `main` or creating PRs.
- **The only strict requirement is versioning:** Whenever committing and pushing changes to GitHub, agents MUST bump the Grokbot version (`node scripts/bump-version.mjs patch|minor|major`).

## Grokbot Versioning (MANDATORY)

Grokbot has its own semver `x.y.z` independent of the upstream OpenHands agent-canvas version (`1.12.0`).

- **Single source of truth:** `VERSION` at repo root.
- **Mirrored in code:** `OpenHands/src/constants/grokbot-version.ts` (`GROKBOT_VERSION`) — must stay in sync with `VERSION`. The sidebar badge next to the logo reads from this constant.
- **Every commit pushed to GitHub MUST bump the version.** CI (`version-guard.yml`) fails if `VERSION` is unchanged vs `main` or is not a valid semver increment, or if the TS file is out of sync.
- **How to bump:**
  ```bash
  node scripts/bump-version.mjs patch  # (fixes, small tweaks, config changes)
  node scripts/bump-version.mjs minor  # (new features, automations, UI updates)
  node scripts/bump-version.mjs major  # (breaking / major architecture shifts)
  # or explicit:
  node scripts/bump-version.mjs 0.7.38
  ```
  Commit the two changed files together with your feature/fix commit. Do not batch multiple features under one version bump — one logical push = one bump.
- **Semver guidance:**
  - `z` (patch): bug fixes, style tweaks, copy changes, small refactors.
  - `y` (minor): new features, new automations, noticeable UI changes (non-breaking).
  - `x` (major): breaking changes, major architecture shifts, public API changes.
- **Never edit the version files by hand** — use the script so both files stay in sync.

## Repo layout

- `/projects/Grokbot` is the persisted clone (keep work here, not ephemeral workspace).
- `OpenHands/` is the upstream agent-canvas app (frontend + services). Grokbot customizations live alongside upstream code.
- `Dockerfile` builds the backend image (agent-server + automation) deployed via Coolify.
- `scripts/deploy-frontend.sh` builds the Vite SPA and deploys it to Cloudflare Pages (legacy fallback only).
- `OpenHands/config/defaults.json` holds version pins; `OpenHands/package.json` is the upstream npm version — do not confuse with Grokbot's `VERSION`.

## Deployment Workflow (CRITICAL — Unified Coolify)

Starship uses a **unified deployment**: the Docker container serves both the frontend
(via `scripts/static-server.mjs` on port 8000) and the backend (agent-server on 18000,
automation on 18001). The static server injects the session API key, proxies API calls,
and handles WebSockets — all on a single origin.

### Primary URL: `https://ship.beenex.org`

- **Pushing or merging to `main` automatically triggers Coolify deployment** for the
  entire stack (frontend + backend). Coolify is connected via the GitHub App.
- **NEVER call the manual Coolify `deploy` tool after pushing to `main`.**
- **How to verify deployment:**
  1. Commit and push to `main`.
  2. Use `list_deployments` or `deployment(action: "get")` to watch the build.
  3. Verify health: `curl -fsS https://ship.beenex.org/health`.
  4. Verify automation: `curl -fsS https://ship.beenex.org/api/automation/health`.
- **MANDATORY: Always monitor deployments to completion.** The definition of
  "deployed" is a `finished` status AND a passing health check.
- `https://grok.beenex.org` and `https://grok-api.beenex.org` also work as
  aliases but `ship.beenex.org` is the canonical production URL.
- Run `npm --prefix OpenHands run lint` / `build` before pushing to catch errors early.

## Environment Variables (Coolify as Source of Truth)

- **Coolify is the single source of truth for production configuration and secrets.**
- **Never commit secrets, tokens, or environment values to Git.**
- **Managing Environment Variables:**
  - **Runtime Variables** (API keys, server settings): Configure in Coolify with **Build-Time: No**.
  - **Build-Time Variables** (frontend `VITE_*`): Configure in Coolify as Build-Time variables.
- **Introducing New Variables in Code:**
  1. Frontend: `import.meta.env.VITE_*`. Set in Coolify as Build-Time.
  2. Backend: `process.env.*`. Set in Coolify.
  3. Bump version, commit code changes to Git.

## External CLI & ACP Provider Integrations (MANDATORY)

### Avoid Trajectory Lock-In

- Treat previous agent plans, comments, message-board status, and claims such as `DONE` as hypotheses, not proof. Re-derive the current state from the checkout, pinned dependencies, official provider documentation, and live runtime.
- Do not preserve a package name, command, model ID, credential mechanism, or architecture merely because an earlier step assumed it. When evidence contradicts the current trajectory, stop and revise the plan before editing code.
- Before proposing work, explicitly separate **already implemented**, **partially implemented**, and **missing** behavior so plans do not duplicate existing code or mistake UI scaffolding for an operational integration.

### Verify Before Planning or Editing

- Inspect the current provider registry, UI, authentication flow, Dockerfile, pinned SDK, tests, Coolify environment variables, and persistent-storage mounts before planning an external CLI or ACP integration.
- **Never invent or infer package names, CLI flags, model IDs, or authentication variables.** Verify them against the provider's current official documentation and authoritative package registry. Run the real package lookup and CLI `--help` / `--version` where possible.
- Do not ask the user to choose between a verified native route and speculative wrappers. Recommend the supported native route; consider a custom bridge only after an actual compatibility failure proves it is necessary.
- If a package, command, model, or credential mechanism cannot be verified, label it unverified and do not present it as an implementation option.

### ACP Provider Rules

- Prefer the provider's native ACP server whenever one exists.
- Cursor's currently verified native ACP command is `agent acp`, installed using Cursor's official installer. Do not use `cursor-agent --acp` or `@agentclientprotocol/cursor-agent-acp` unless future official documentation and registry checks prove them valid.
- Providers absent from the pinned OpenHands SDK registry must use `acp_server: "custom"` with an explicit command. Verify the materialized Agent Profile rather than assuming the frontend preset is sufficient.
- Do not hardcode model IDs from memory. Source them from the pinned SDK registry or the ACP server's runtime `configOptions` / model-discovery response.
- Verify provider-specific permission requests and blocking protocol extensions. A successful ACP handshake does not prove prompts, tool approvals, planning, or follow-up turns work.

### Credentials & Persistence

- Coolify remains the production source of truth for credentials. Never commit provider credentials.
- For Cursor automation, prefer a Cursor User API Key supplied through `CURSOR_API_KEY`.
- Creating and `chown`-ing a directory in the Dockerfile does **not** make it persistent. State survives container replacement only when the exact path, or a parent path, has a Coolify persistent-storage mount.
- If browser-login state is required, add and verify a persistent mount for the provider's credential directory. Test it across full container recreation, not only process restart.
- Every installed external CLI must have a deterministic executable path and a Docker build check such as `agent --version`.

### Definition of Working

An ACP provider is not complete until all of the following pass:

1. The production container contains the expected executable.
2. Authentication succeeds through the production credential path.
3. `POST /api/agent-profiles/<id>/materialize` returns `valid: true` with the exact expected command and model.
4. A new production conversation completes a real prompt.
5. The agent successfully performs a file or terminal tool action and handles its permission request.
6. A follow-up prompt works without hanging on provider-specific protocol extensions.
7. Model selection is confirmed from the live ACP session rather than inferred from UI state.
8. Usage appears in the provider's account dashboard or usage records.
9. The integration still works after a full container redeploy.

Unit tests, successful compilation, visible UI, authentication probes, ACP initialization, and HTTP 200 responses alone are not sufficient proof.

## Live App Preview (shareable URLs)

- Apps the agent starts inside the container are exposed by **hostname**:
  `PREVIEW_HOST_PATTERN=p{port}.beenex.org` makes `https://p3000.beenex.org` proxy
  1:1 to `127.0.0.1:3000`. No path rewriting, so absolute asset URLs, the app's own
  `/api/*`, client-side routing, and WebSockets/HMR all work unmodified.
- **Any port works.** A Traefik `HostRegexp(^p[0-9]+\.beenex\.org$)` router — set as a
  *custom label* on the Coolify app — routes every `pNNNN` hostname to the container.
  This replaced an 8-port allowlist that required the agent to pick from a list; it
  picked 8798 on the first real run, which is why the constraint had to go.
- **The custom label is the fragile part.** Coolify regenerates the labels block when
  the FQDN field changes, which would silently drop the regex router and leave only
  the fixed `pNNNN` domains still listed in FQDN. If arbitrary ports stop resolving,
  check `custom_labels` first. Labels apply at container *creation* — a restart is not
  enough, a redeploy is.
- The stack's own ports (proxy 8000, agent-server 18000, automation 18001) are always
  refused, and ports below 1024 are never proxied. Preview hostnames are **public** —
  anyone with the link reaches the app, matching how `grok.beenex.org` already behaves.
- A separate hostname is also a separate origin, which is deliberate: the session API
  key lives in `localStorage` on the canvas origin, and previews must not read it.
- The agent learns all this from `app_preview` in the `<RUNTIME_SERVICES>` block
  (`scripts/runtime-services-info.mjs`), so it hands the user a public URL instead of
  a localhost one.

## Autonomous Ralph Loop & Budget Guardrails

Grokbot supports unattended, iterative execution via the **Ralph loop** pattern (`scripts/ralph-runner.mjs`).

### Workflow & Skills:
1. **Plan & Interview**: Use the `generate-prd` skill to create `tasks/prd-[feature].md`.
2. **Compile to Manifest**: Use the `prd-to-json` skill to create `prd.json` with budget controls.
3. **Launch Loop**: Run `./scripts/ralph-loop.sh [options]`.

### Execution Modes & Guardrails:
- **Subscription / ACP Mode** (Claude Pro/Team, ChatGPT):
  - `--mode subscription --max-turns 25 --cooldown 15`
  - Hard agent turn caps, burst pacing, and automated 429 / usage limit detection with graceful shutdown.
- **API Billing Mode** (Direct Token Billing):
  - `--mode api --max-budget 10.00 --max-per-story 0.80`
  - Hard dollar ceiling enforced deterministically at the runner level.

### Iteration Protocol:
- Each loop runs with fresh context.
- Passes quality checks (`npm --prefix OpenHands run build` & `lint`).
- Automatically bumps the Grokbot patch version (`node scripts/bump-version.mjs patch`) and commits `feat: [US-XXX] - [Title]`.
- Appends learnings to `progress.txt` and archives past features upon branch changes (`archive/YYYY-MM-DD-feature/`).

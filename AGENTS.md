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
- `scripts/deploy-frontend.sh` builds the Vite SPA and deploys it to **Cloudflare Pages**.
- `OpenHands/config/defaults.json` holds version pins; `OpenHands/package.json` is the upstream npm version — do not confuse with Grokbot's `VERSION`.

## Deployment Workflow (CRITICAL — Frontend vs Backend)

Grokbot has a **split deployment**: the frontend and backend deploy separately.

### Frontend → Cloudflare Pages (MANDATORY for all UI/frontend changes)

- **Any change under `OpenHands/src/`, `OpenHands/public/`, or any file that affects the Vite build MUST be deployed via Cloudflare Pages.**
- **How to deploy frontend:**
  ```bash
  ./scripts/deploy-frontend.sh
  ```
  This runs `npm --prefix OpenHands run build` then `npx wrangler pages deploy` to push the static build globally.
- **DO NOT rely on the Coolify Docker build to deploy frontend changes.** The production frontend is served from Cloudflare Pages, not from the Docker container.
- Run `npm --prefix OpenHands run lint` / `build` before deploying to catch errors early.

### Backend → Coolify (auto-deploy on push to main)

- **Pushing or merging to `main` automatically triggers Coolify deployment** for the backend Docker container (agent-server, automation server). Coolify is connected via the GitHub App.
- **NEVER call the manual Coolify `deploy` tool after pushing to `main`.** Doing so creates a duplicate deployment of the exact same commit.
- **How to monitor and verify backend deployment:**
  1. Commit and push/merge to `main`.
  2. Coolify will automatically start building within ~5 seconds.
  3. Use `list_deployments` or `deployment(action: "get")` (read-only monitoring) to watch the build until status is `finished`.
  4. Verify production health via `curl -s http://grok.beenex.org/health`.
- **MANDATORY: Always monitor deployments to completion.** Never tell the user "once the build finishes…" or "check Coolify yourself." The agent MUST poll `deployment(action: "get", uuid: "<id>")` every 2–3 minutes until status is `finished` or `failed`, then report the result. If the build fails, read the logs and diagnose immediately. The definition of "deployed" is a `finished` status AND a passing health check — not "I pushed, it should work."

### Combined changes (frontend + backend)

When a change touches both frontend and backend code:
1. Commit and push to `main` (triggers Coolify backend deploy automatically).
2. Run `./scripts/deploy-frontend.sh` to deploy the frontend to Cloudflare Pages.
3. Verify both are live.

## Environment Variables (Coolify as Source of Truth)

- **Coolify is the single source of truth for production configuration and secrets.**
- **Never commit secrets, tokens, or environment values to Git.** (`.env.local` is strictly for local machine testing and is git-ignored).
- **Managing Environment Variables:**
  - **Runtime Variables** (backend API keys, server settings, ports): Configure in Coolify under `grokbot` $\rightarrow$ Environment Variables with **Build-Time: No**. Updating these requires a container restart/redeploy.
  - **Build-Time Variables** (frontend `VITE_*` variables): These are baked in at build time by `scripts/deploy-frontend.sh`. Set them in the environment before running the deploy script, or configure them in Cloudflare Pages dashboard.
- **Introducing New Variables in Code:**
  1. Frontend: Access via `import.meta.env.VITE_*`. Ensure the variable is available at build time when running `deploy-frontend.sh`.
  2. Backend: Access via `process.env.*` or `os.environ.get(*)`. Set the value in Coolify.
  3. Bump version, commit code changes to Git.

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


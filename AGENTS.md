# AGENTS.md — Grokbot

This file is the index of durable rules for any agent (human or AI) working in this repo. Keep it concise; move long detail into daily logs.

## Grokbot Versioning (MANDATORY)

Grokbot has its own semver `x.y.z` independent of the upstream OpenHands agent-canvas version (`1.12.0`).

- **Single source of truth:** `VERSION` at repo root. Current: `0.1.2`.
- **Mirrored in code:** `OpenHands/src/constants/grokbot-version.ts` (`GROKBOT_VERSION`) — must stay in sync with `VERSION`. The sidebar badge (`v0.1.2` next to the logo) reads from this constant.
- **Every commit pushed to GitHub MUST bump the version.** CI (`version-guard.yml`) fails the PR if `VERSION` is unchanged vs `main` or is not a valid semver increment, or if the TS file is out of sync.
- **How to bump:**
  ```bash
  node scripts/bump-version.mjs patch  # 0.1.2 -> 0.1.3  (fixes, small tweaks)
  node scripts/bump-version.mjs minor  # 0.1.2 -> 0.2.0  (new features)
  node scripts/bump-version.mjs major  # 0.1.2 -> 1.0.0  (breaking / major)
  # or explicit:
  node scripts/bump-version.mjs 0.1.3
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
- `Dockerfile` builds a combined image (agent-server + automation + frontend) and deploys via Coolify on push to `main`.
- `OpenHands/config/defaults.json` holds version pins; `OpenHands/package.json` is the upstream npm version — do not confuse with Grokbot's `VERSION`.

## Deployment Workflow (CRITICAL — Auto-Deploy via GitHub App)

- **Pushing or merging to `main` automatically triggers Coolify deployment.** Coolify is connected to GitHub via the GitHub App and automatically queues a build upon every push.
- **NEVER call the manual Coolify `deploy` tool after pushing to `main`.** Doing so creates a duplicate deployment of the exact same commit.
- **How to monitor and verify deployment:**
  1. Commit and push/merge to `main`.
  2. Coolify will automatically start building within ~5 seconds.
  3. Use `list_deployments` or `deployment(action: "get")` (read-only monitoring) to watch the build until status is `finished`.
  4. Verify production health via `curl -s http://grok.beenex.org/health`.
- Run `npm --prefix OpenHands run lint` / `build` when touching frontend code; keep diffs minimal.

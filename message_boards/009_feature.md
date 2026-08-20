# Instant 3-Second Production Deployment via Cloudflare Pages

## Overview
GrokBot's frontend is decoupled from the monolithic Docker container build lifecycle. UI, styling, hooks, and frontend changes deploy directly to Cloudflare Pages edge network in ~3 seconds. The backend (agent-server, automation, python, proxies) remains hosted on Coolify at `api.grok.beenex.org`.

## Architecture

```
User / Browser
    │
    ├── HTML/JS/CSS (Static UI) ────► https://grok.beenex.org (Cloudflare Pages CDN)
    │                                 Deployed in ~3 seconds via scripts/deploy-frontend.sh
    │
    └── API / WebSockets / Previews ─► https://api.grok.beenex.org (Coolify Container)
                                      Full agent-server & automation backend
```

## How to Deploy

### 1. Frontend Updates (~3 seconds)
Whenever modifying UI components, styling, hooks, or assets:
```bash
./scripts/deploy-frontend.sh
```
Or directly:
```bash
npm --prefix OpenHands run build && npx wrangler pages deploy OpenHands/build --project-name=grokbot
```

### 2. Backend Updates (~3 minutes)
When touching Python backend, Dockerfile, entrypoint scripts, or container dependencies:
```bash
node scripts/bump-version.mjs patch|minor|major
git commit -am "feat: description"
git push origin main
```
GitHub Actions will run tests, build the Docker container image, push to `ghcr.io`, trigger Coolify, and verify health.

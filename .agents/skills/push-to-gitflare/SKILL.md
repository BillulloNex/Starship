---
name: push-to-gitflare
description: >
  Push committed changes to GitFlare (Cloudflare-based git hosting) to trigger CI/CD and deploy to Coolify.
  Use whenever the user says "push to gitflare", "deploy", "ship it", "push changes", "push to production",
  or after completing a feature/fix that needs to go live. This replaces `git push origin main` for the
  GitFlare workflow. Changes are pushed to GitFlare → CI runs in Cloudflare Sandboxes → auto-deploys to
  Coolify on the Lenovo server.
---

# Push to GitFlare (CI/CD → Coolify Deploy)

Push code changes through GitFlare's pipeline: git push → CI tests → Coolify deployment.

## Architecture

```
git push gitflare main
       │
       ▼
GitFlare Worker (gitflare.thomas-aed.workers.dev)
       │
  ┌────┼─────────────────┐
  │    │                  │
  ▼    ▼                  ▼
Artifacts  D1 Metadata   CI Queue
(git)      (audit log)      │
                             ▼
                        Sandbox Runner
                        (lint → test → build)
                             │
                             ▼ (on pass)
                        Coolify Deploy API
                        (cloud.comfyspace.tech)
                             │
                             ▼
                        Starship on Lenovo
                        (grok.beenex.org)
```

---

## Quick Push (One Command)

```bash
git push gitflare main
```

That's it. The `gitflare` remote is pre-configured with embedded credentials.

---

## Full Workflow (When Making Changes)

### Step 1: Make and commit changes

```bash
# Stage changes
git add -A

# Commit with a descriptive message
git commit -m "feat: <description of change>"
```

### Step 2: Push to GitFlare

```bash
git push gitflare main
```

### Step 3: Monitor CI (optional)

Check CI status via the API:
```bash
curl -s https://gitflare.thomas-aed.workers.dev/api/repos/starship/ci/runs \
  -H "Authorization: Bearer gf_7e18ff751ddd4a63a5ab777f9093b417" | python3 -m json.tool
```

Or open the dashboard: https://gitflare.thomas-aed.workers.dev/

### Step 4: Verify deployment

After CI passes, Coolify automatically redeploys. Check via:
```bash
curl -s https://grok.beenex.org/api/health
```

---

## Credentials Reference

| Key | Value | Purpose |
|-----|-------|---------|
| **Admin API Key** | `gf_7e18ff751ddd4a63a5ab777f9093b417` | Full admin access to GitFlare API |
| **Push API Key** | `gf_2d61a2e4d93146d685637f55e8b691ac` | Write access to Starship repo |
| **GitFlare Dashboard** | `https://gitflare.thomas-aed.workers.dev/` | Web UI |
| **GitFlare API** | `https://gitflare.thomas-aed.workers.dev/api/` | REST API |
| **Starship Repo ID** | `9234778a-dcdb-4984-96b1-4e475d742ff8` | D1 record ID |
| **Coolify App UUID** | `b13aardv73k5fyl01a80ggzc` | Starship on Coolify |
| **Deploy Target** | `production-lenovo` | Coolify → Lenovo server |

---

## Useful API Calls

### Trigger CI manually (without pushing)
```bash
curl -X POST https://gitflare.thomas-aed.workers.dev/api/repos/starship/ci/trigger \
  -H "Authorization: Bearer gf_7e18ff751ddd4a63a5ab777f9093b417" \
  -H "Content-Type: application/json" \
  -d '{"branch": "main"}'
```

### Trigger deploy manually (skip CI)
```bash
curl -X POST https://gitflare.thomas-aed.workers.dev/api/repos/starship/deploys/8f6c9b36-6f9b-4654-937e-135b8104b145/run \
  -H "Authorization: Bearer gf_7e18ff751ddd4a63a5ab777f9093b417" \
  -H "Content-Type: application/json" \
  -d '{"branch": "main", "commit_sha": "HEAD"}'
```

### List recent CI runs
```bash
curl -s https://gitflare.thomas-aed.workers.dev/api/repos/starship/ci/runs \
  -H "Authorization: Bearer gf_7e18ff751ddd4a63a5ab777f9093b417"
```

### View audit log (who pushed what)
```bash
curl -s "https://gitflare.thomas-aed.workers.dev/api/repos/starship" \
  -H "Authorization: Bearer gf_7e18ff751ddd4a63a5ab777f9093b417"
```

---

## Also Push to GitHub (Dual Remote)

To keep GitHub in sync as a mirror:
```bash
git push origin main && git push gitflare main
```

Or push to both at once:
```bash
git remote add all https://github.com/BillulloNex/Starship.git
git remote set-url --add --push all https://github.com/BillulloNex/Starship.git
git remote set-url --add --push all https://thomas:gf_2d61a2e4d93146d685637f55e8b691ac@gitflare.thomas-aed.workers.dev/git/starship
git push all main  # pushes to both GitHub and GitFlare
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `403 Forbidden` on push | API key expired or wrong — check with `curl /api/bootstrap/keys` |
| CI stuck in `queued` | Check Worker logs: `npx wrangler tail gitflare` |
| Deploy didn't trigger | Verify deploy target: `curl /api/repos/starship/deploys` |
| Coolify deploy failed | Check Coolify directly: use `coolify-mcp-server` `diagnose_app` tool |

---

## CI Configuration

The CI pipeline is defined in `.gitflare/ci.yml` in this repo. To modify the pipeline (add tests, change sandbox tier, etc.), edit that file and push.

Current pipeline: **lint → test → build → deploy to Coolify**

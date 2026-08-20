---
name: deploy-to-cloudflare-pages
description: Deploy static websites, HTML5 canvas games, landing pages, React/Vite SPAs, and client-side web apps to permanent, 24/7/365 Cloudflare Pages hosting. Use whenever the user asks for a sharable link, asks to host/deploy a game or web app, or wants a permanent public URL.
---

# Deploy to Cloudflare Pages (`*.pages.dev`)

This skill provides fast, reliable, permanent edge deployment for any static web application or game created in GrokBot.

## Why Cloudflare Pages?
- **Permanent 24/7/365 Uptime:** Unlike container preview links (`p8080.beenex.org`), Cloudflare Pages links never expire and never die when a container sleeps or a bash session terminates.
- **Zero Configuration:** Serves raw HTML/JS/CSS, WebAssembly, pixel art, sound effects, or bundled React/Vite/Svelte builds.
- **Global CDN:** Instant load times across 300+ edge locations worldwide.

---

## When to Use This Skill
Trigger this skill whenever the user says:
- *"Give me a sharable link"*
- *"Host this game"*
- *"Deploy my website"*
- *"Make a playable game / app that I can send to friends"*
- *"Publish this to the web"*

---

## Deployment Instructions

### Option 1: Using the Built-in `grokbot-deploy` Tool (Recommended)

Run `grokbot-deploy` pointing at your project directory:

```bash
grokbot-deploy ./workspace --name <clean-app-slug>
```
or from a build directory:
```bash
grokbot-deploy ./dist --name <clean-app-slug>
```

### Option 2: Using `grokbot-app` CLI
```bash
grokbot-app deploy-pages ./workspace --name <clean-app-slug>
```

### Option 3: Using Direct Wrangler CLI
```bash
npx -y wrangler@latest pages deploy ./workspace --project-name=<clean-app-slug> --commit-dirty=true
```

---

## Guidelines for Naming & Output

1. **Slug Convention:**
   - Use clean, lowercase, alphanumeric slugs with hyphens: e.g. `space-invaders-arcade`, `retro-synth-piano`, `cyber-pong-game`.
   - Avoid special characters, spaces, or leading/trailing hyphens.

2. **Directory Requirements:**
   - Make sure an `index.html` file exists in the directory being deployed.
   - For frameworks (Vite, React, Vue, Svelte), run the build step first (`npm run build`) and deploy the output directory (`./dist` or `./build`).

3. **Deliver the URL in the Final Response:**
   - Always highlight the permanent public URL clearly:
   > 🎮 **Play Online:** [https://<clean-app-slug>.pages.dev](https://<clean-app-slug>.pages.dev)  
   > ⚡ *Deployed to Cloudflare Pages — permanent 24/7 global hosting.*

---

## Prohibited Anti-Patterns
- **NEVER** run `python3 -m http.server 8080` in the workspace root when asked for a shareable link. Subshell commands terminate when the turn finishes, causing the link to break immediately.
- **NEVER** give the user `http://localhost:<port>` — they cannot reach your container's loopback interface.

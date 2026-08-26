# Grokbot Dedicated Browser VM (Prime Intellect)

This directory contains the standalone headless/headed browser service designed to run on a dedicated Linux VM (e.g. on **Prime Intellect**).

---

## 🌟 Why Dedicated Browser VM?
1. **Persistent Authentication:** Full Google Chrome state (cookies, localStorage, extensions, active logins) lives on persistent `/data/chrome-profile` and survives reboots.
2. **Dual-Channel Co-Navigation:**
   - **Agent Channel:** Full programmatic control via Chrome DevTools Protocol (`ws://<VM_IP>:9222`).
   - **Human Channel:** Real-time visual stream via noVNC (`http://<VM_IP>:6080/vnc.html`) embedded directly into Grokbot's Browser panel.
3. **Zero Profile Lock Conflicts:** One unified browser instance eliminates Chromium `SingletonLock` crashes.
4. **Instant Human MFA Handoff:** When Cloudflare or 2FA triggers, the human interacts with the live viewport directly; the agent resumes on the same tab immediately.

---

## 🚀 Quick Setup on Prime Intellect (1-Liner)

1. SSH into your Prime Intellect VM (Ubuntu 22.04 or 24.04):
   ```bash
   ssh root@<YOUR_PRIME_INTELLECT_IP>
   ```

2. Copy this folder or clone the repo, and run:
   ```bash
   cd browser-vm
   chmod +x setup.sh
   ./setup.sh
   ```

---

## ⚙️ Ports Exposed

- **`6080`**: noVNC Web UI stream (embedded in Grokbot's Interactive Browser panel).
- **`9222`**: Chrome DevTools Protocol (CDP) WebSocket endpoint (used by Agent).
- **`5900`**: Raw VNC server (optional).

---

## 🔗 Connecting Grokbot to Browser VM

In Grokbot (Coolify or Cloudflare Pages env):
- Set `VITE_BROWSER_VM_URL=http://<YOUR_PRIME_INTELLECT_IP>:6080/vnc.html` (or `https://browser.beenex.org/vnc.html` if behind SSL reverse proxy).
- Set `BROWSER_CDP_URL=ws://<YOUR_PRIME_INTELLECT_IP>:9222` in backend env if connecting agent over CDP.

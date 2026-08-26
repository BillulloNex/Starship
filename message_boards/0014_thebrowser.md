There are like 3 ways the browser functionality can be called now - playwright, interactive vnc and the other one.

All have their own cons that prevent them from being fully perfect capability, feature parity to human usage of the browser.

I wanna do things differently:

- Do a VM with a browser instance so that the agent can navigate on and humans can help with bs like MFA and all that, and the auth is persistent and all that good shit
- Disable the other types so there is no confusion.
- Make sure the auth state persists between chats, browser sessions and deployments of updates. So i dont have to re-login every hour.

# Stack Decision: Steel.dev (OSS)

Going with **Steel.dev** instead of VNC or Neko.

### Why:
- **No VNC BS:** No Xvfb, no Fluxbox window borders, no laggy VNC tiles. Just pure Chrome viewport over CDP WebSocket.
- **Built-in Anti-Bot:** Has fingerprint injection out of the box so Cloudflare / bot shields don't instantly block the agent.
- **Human Takeover for MFA:** When 2FA or CAPTCHA hits, human can just click/type in the embedded canvas, solve it, and the agent keeps rolling on the same tab.
- **Zero Coordinate Drift:** Agent DOM coordinates and human clicks are 1:1 identical.
- **Persistent Auth:** Profile mounted to `/data/chrome-profile` so logins (Google, GitHub, etc.) stay alive across container reboots.
- **Easy Networking:** Standard HTTP/WS ports (`3000` API/UI, `9223` CDP). No messing with UDP WebRTC ranges.

### The Setup:
- **Port 3000:** Steel session API & embedded live viewer (`v1/devtools/inspector.html`)
- **Port 9223:** Direct CDP WebSocket for the agent
- **Mount `/data/chrome-profile`:** Holds our persistent login session
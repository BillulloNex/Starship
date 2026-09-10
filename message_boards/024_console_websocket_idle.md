# 024 — Console idle timeout (Coolify Traefik, not git)

**Status:** Applied on Coolify (2026-09-09). Not a code change.

This lives on the Coolify proxy, not in the Starship repo. Coolify is the source of truth for production Traefik. Do not try to "fix" a 2-minute Console drop by committing timeout flags — they are not in this codebase.

## What happened

On 2026-09-09, standalone Console at `https://ship.beenex.org` ran a few commands (`ls`, `cd`, `ls`), then:

```
Error executing command: Bash WebSocket not available
```

The UI still said **Ready**. `git clone` never reached the agent-server.

Production logs:

| UTC | What |
|---|---|
| 01:55:14–01:55:45 | `Received bash request` (working commands) |
| 01:57:50 | `Bash websocket disconnected` (~2 min idle) |
| after that | no bash requests until a later probe |

The agent-server bash socket has no idle timer. It waits on `receive_json()` until the connection dies. The closer was the Coolify Traefik in front of the container.

## Where the timeout lives

App: **starship** on Coolify, server **lenovo** (`kw1b1pmbkbwqqrjo3sfh6hbg`).

Proxy: Traefik v3 (`coolify-proxy`). Before this change, the compose had **no** `respondingTimeouts` flags, so Traefik 3 defaults applied (`readTimeout` 60s, `idleTimeout` 180s).

`0s` = no Traefik timeout. That is unbounded and reaps nothing. We set **2 hours**.

## What was applied (2026-09-09)

Saved on the Coolify server proxy compose, then proxy restarted. `last_saved_settings` matched `last_applied_settings` after restart. `https://ship.beenex.org/health` returned ok.

On both `http` and `https` entrypoints:

```
--entrypoints.http.transport.respondingTimeouts.readTimeout=2h
--entrypoints.http.transport.respondingTimeouts.writeTimeout=2h
--entrypoints.http.transport.respondingTimeouts.idleTimeout=2h
--entrypoints.https.transport.respondingTimeouts.readTimeout=2h
--entrypoints.https.transport.respondingTimeouts.writeTimeout=2h
--entrypoints.https.transport.respondingTimeouts.idleTimeout=2h
```

This is **server-wide**. Every app behind `lenovo`'s Traefik inherited the 2h window, not only Starship Console.

## How to change it later

1. Coolify → Servers → **lenovo** → **Proxy**
2. Edit the Traefik `command:` list (the six `respondingTimeouts` lines above)
3. Save, then **restart the proxy** (not only the starship app). Labels/command apply at container creation.

API equivalent (needs a write Coolify token):

- `PUT /api/v1/servers/{server_uuid}/proxy/configuration` — compose YAML, base64
- `POST /api/v1/servers/{server_uuid}/proxy/restart`

Do not put the compose in git. A git revert will not roll this back; a Coolify proxy reset to defaults would.

## What this does not fix

Console still has **no reconnect and no ping** (`OpenHands/src/hooks/use-bash-command-runner.ts`). After Traefik (or anything else) closes `/sockets/bash-events`, later commands fail immediately with `Bash WebSocket not available` until the user leaves and re-enters Console. The green Ready pill is "runtime exists", not "bash socket is open".

If idle drops return under 2 hours, look at Console reconnect/keepalive in code — not Traefik first.

## Verify

```bash
# App still up
curl -fsS https://ship.beenex.org/health
curl -fsS https://ship.beenex.org/api/automation/health

# Coolify proxy compose still has 2h (GET /servers/{uuid}/proxy)
# look for respondingTimeouts.readTimeout=2h on http and https
```

If Console dies again after ~2 minutes, the 2h flags were lost (Coolify regenerated default compose). Re-apply the six lines and restart the proxy.

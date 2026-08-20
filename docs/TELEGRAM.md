# Telegram mobile bridge

GrokBot can run an optional Telegram bot inside the existing all-in-one
container. The bridge uses Telegram long polling, so it does not need a new
public webhook or DNS route. It talks to the Agent Server over localhost using
the same session API key as the web UI.

## Setup

1. In Telegram, message `@BotFather`, run `/newbot`, and copy the bot token.
2. In Coolify, add `TELEGRAM_BOT_TOKEN` as a runtime variable (Build-Time: No),
   then restart the deployment.
3. Open a private chat with the new bot and send `/whoami`.
4. Add the returned numeric ID to `TELEGRAM_ALLOWED_USER_IDS` in Coolify and
   restart again. Multiple IDs can be comma-separated.
5. Optional: set `TELEGRAM_GROKBOT_URL=https://grok.beenex.org` so `/status`
   replies include a link to the full web conversation.

The bridge uses the active Agent Profile. If none is active and more than one
profile exists, select one in GrokBot or set `TELEGRAM_AGENT_PROFILE_ID` to a
profile UUID.

## Commands

- `/new [task]` starts a fresh conversation.
- `/latest` attaches the chat to the most recently updated conversation.
- `/use <conversation-id>` attaches to a specific conversation.
- `/status` shows the attached conversation, its state, and the latest reply.
- `/stop` interrupts the current agent run.
- `/whoami` displays the Telegram user ID needed for the allowlist.
- `/help` displays command help.

Any other text continues the attached conversation. If the chat is not attached
yet, the first message starts a new conversation automatically.

## Optional runtime variables

| Variable                            | Default             | Purpose                                                   |
| ----------------------------------- | ------------------- | --------------------------------------------------------- |
| `TELEGRAM_AGENT_PROFILE_ID`         | active/only profile | Agent Profile used for new conversations                  |
| `TELEGRAM_WORKING_DIR`              | `/projects/Grokbot` | Workspace for new conversations                           |
| `TELEGRAM_GROKBOT_URL`              | empty               | Public base URL included in status replies                |
| `TELEGRAM_RESPONSE_TIMEOUT_SECONDS` | `1800`              | How long to wait before returning a still-working message |
| `TELEGRAM_POLL_TIMEOUT_SECONDS`     | `25`                | Telegram long-poll duration                               |

Only private chats are accepted. When `TELEGRAM_ALLOWED_USER_IDS` is empty, the
bot stays in setup mode and will only identify the sender; it cannot start or
control agents.

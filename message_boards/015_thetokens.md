I'm building the dark factory x giga factory (like tesla) of software related tasks.

To do that, we need the atom of the factory: tokens

They are three types of model usage.

1. API usage this includes pay as you do, prepaid credit, free model API & promotional credits
2. Subscriptions with ACP support: ChatGPT, Cursor, OpenCode
3. Subscriptions without ACP support (workaround like CLI): antigravity, claude code

Request 1: ✅ DONE (v0.39.0–v0.39.3)

Check to make sure all of those above are supported, if not lets work on implementing it. 

> All three types fully supported. Cursor and OpenCode added as first-class ACP providers
> with icons, auth probes, credential fields, and i18n strings.
> DEFERRED: OpenCode & Cursor end-to-end auth testing — auth.json injection and
> device-code OAuth flow for seamless login (like Codex has) to be built later.

Request 2: ✅ DONE (v0.40.0–v0.41.1)

I want to build out a system where I can see all the limits left (like chatgpt limit in the chatgpt app). These limits can be either automatically detected (like codex acp), invoked (like claude code cli), or manually input (like api credit limit)

So i can go in and go brrrr

> Floating "Token Fuel Gauge" widget (bottom-right) with unified provider panel.
> **Auto-detected (live polling every 60s):**
> - Claude Pro — REAL data via Anthropic's OAuth usage API (`/api/oauth/usage`),
>   same endpoint as Claude Code CLI `/usage`. Shows 5-hour session %, weekly %,
>   and usage credits ($spent/$limit). Token expiry detection with specific warnings.
> - ChatGPT Plus — via Codex ACP WHAM API (5-hour + weekly limits)
> - OpenRouter — via `/api/llm/balance` (remaining credits, free tier detection)
> - Vercel AI Gateway — via `GET /v1/credits` (balance + total used)
> **Manual input:** Preset-based form (Router by Ramp $26, OpenAI, Anthropic, Google)
> with auto-decrement from live conversation cost.
> **Safety:** No fake data — unverified providers show amber "Unknown" warning.
> Fake 100% positives killed (was showing green while Claude was exhausted).

Request 3: NOT STARTED

There should be an auto-mode where a request is sent to the most capable model that is available and still with the limits good to go. 

It takes the planning and brainpower of the user away to give them a good time. 

I guess we can use public benchmarks to make the who-does-what-best model router calls. I'm open to your ideas
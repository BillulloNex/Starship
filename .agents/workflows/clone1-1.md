---
description: Clone an application 1:1 onto paper.design
---

You will be asked to mirror a running application onto a paper.design canvas, screen by
screen, as faithfully as you can. The output is a set of artboards that match the real app
closely enough that the user can mark them up — delete a row, move a panel, annotate a
control — and have those edits mean something. It is a measuring job, not a design job.

**Do not improve anything.** Not the spacing, not the contrast, not the inconsistent accent
colors. Fixing things here destroys the artifact's whole purpose: the user needs to see what
they actually have before deciding what to change. Write down what's wrong; leave it on the
canvas.

## Phase 0 — Read the Paper guide

`get_guide({ topic: "paper-mcp-instructions" })` then `get_basic_info`. Every session, before
any other Paper call. Note what tokens and artboards already exist in the file — you are
adding to someone's document, not starting a blank one.

## Phase 1 — Capture ground truth

Never build from memory, from reading React components, or from a description. Get pixels.

Boot the app with a mocked API so it runs without a backend — in this repo that's
`npm run dev:mock` from `OpenHands/` (installs first if `node_modules` is missing; it's a
few minutes). Confirm the port from the dev server's own output rather than assuming.

Then drive it with Playwright. Resolve `@playwright/test` from the app's `node_modules` —
put the script inside that directory, or node won't find the package. Capture at
**1440×900, `deviceScaleFactor: 2`**, one shot per route, into a gitignored `.context/`
directory.

Two things will block you and both are fixable in the script:

- **Onboarding.** Seed the completion flag before navigation via `context.addInitScript`, so
  it's set on every page load. In this app the key is `openhands-onboarded`; find yours by
  grepping the onboarding hook for its storage key, don't guess.
- **Consent / telemetry modals.** These gate on server state, not localStorage, so seeding
  won't help. Click through them per-route: locate the confirm button, check `isVisible()`,
  click, wait.

Take the screenshots, then actually *look* at them. If a screen is empty, blocked, or shows
an error you didn't expect, fix the capture and re-run. Building a frame from a broken
screenshot wastes far more time than re-running the script.

## Phase 2 — Extract the real values

Screenshots give you layout. Only the stylesheet gives you exact color. Grep for the
palette definition — the color scale, semantic aliases, font stacks, radii — and record
literal hex values. In this repo that's `src/index.css` (the `--cool-grey-*` scale) and
`src/tailwind.css` (the `--oh-*` semantic layer).

While you're in there, **inventory every place the design contradicts itself**: accent
colors that don't match across screens, two type scales, duplicate token names with
different values. This list is half the deliverable. Put it in your report to the user.

## Phase 3 — Namespaced mirror tokens

Create a token set that records the app's *current* values under a distinct prefix
(`--color-app-*`, `--font-app-*`). Give each one a `description` naming its source
(`"cool-grey-925, panel surface"`).

This is additive and non-destructive — never overwrite or delete tokens already in the file,
even if they're duplicated or contradictory, unless the user has explicitly told you to
clean them up. Their file, their call.

Every frame then references `var(--color-app-*)`. No raw hex outside the token definitions.
The payoff is that restyling later becomes a token swap instead of a node-by-node edit.

## Phase 4 — Post the brief, then stop

Before the first `create_artboard`, send the user a brief covering: what the current system
actually is (palette with roles, type scale, the contradictions you found), which screens
you plan to mirror and at what size, and anything you intend to deviate on. For a 1:1 clone
this brief documents rather than invents — you are not choosing a mood.

**Wait for approval before creating anything.**

## Phase 5 — Build: once, then clone

Build the shared chrome — sidebar, top nav, whatever repeats — in the first artboard only.
For every subsequent artboard, pull it in with `<x-paper-clone node-id="..." />` and adjust
only what differs, which is usually just the active nav item's background. Rebuilding the
sidebar six times burns tokens and guarantees the six copies drift apart.

For repeated rows — list items, table rows, cards — build one properly, then `duplicate_nodes`
and rename via `set_text_content` using the returned `descendantIdMap`. That map takes you
straight from a source node id to its clone's id, so you never need a lookup pass.

Keep `write_html` calls small — roughly one visual group each. The user is watching the
canvas fill in; a single monolithic call is a black box.

**Vertical lanes:** repeated rows must line up. Give icons, badges, and trailing values
fixed-width slots with `flexShrink: 0` — including when a slot is empty in some rows. `gap`
alone will not hold a column straight across rows with different content lengths.

## Phase 6 — Measure, don't eyeball

Screenshots come back at a stated scale. Convert once and use arithmetic for everything:

```
css_px = displayed_px × (original_width / displayed_width) / deviceScaleFactor
```

Read real edges off the source screenshot — sidebar width, content padding, gaps between
cards, where a section starts. Derive the numbers; don't estimate them. Page padding often
differs per route (this app uses ~44px on Home and ~32px on Job Board), so measure each
screen rather than reusing the last one's values.

## Phase 7 — Review each frame against its source

After finishing a frame, `get_screenshot` it and compare side by side with the original
capture. Check: spacing rhythm, type sizes, contrast, vertical lanes, and whether content
clips where the real app doesn't. Fix the deltas before starting the next frame — errors
compound once you've cloned the chrome forward.

Text that wraps in your frame but sits on one line in the source almost always means your
font-size is a step too large. Trust the source.

## Known Paper quirks

- **SVG `fill-opacity` is dropped.** A translucent chart area comes through as a solid
  block. Set `opacity` on the path node via `update_styles` instead. Gradients on SVG fills
  don't apply either.
- Use flex for all layout. No `margin`, no `display: grid`, no tables. Spacing is `padding`
  and `gap`; for outer spacing between siblings, set `gap` on the parent.
- Set artboard `height: "fit-content"` when content clips unintentionally — don't guess a
  new fixed height. But if the *real app* clips at the fold, mirror the clip; that's
  accurate.
- `finish_working_on_nodes` when done. Mandatory.

## Phase 8 — Report

Tell the user:

- Where the frames are and what each one is.
- Where the raw screenshots live, in case they want them.
- **Every deviation you made, and why.** Mock artifacts especially: disconnected-websocket
  banners, empty states caused by missing fixtures, placeholder counts. Mirror the design,
  not the mock's failure modes — and say which ones you skipped.
- The contradictions from Phase 2, as concrete observations. Seeing four unrelated accent
  colors side by side on one canvas is the moment the problem becomes undeniable, so name
  them plainly.

Then stop and let them mark it up. Do not proceed to restyling, and do not apply any change
to the codebase, until they've reviewed the mirror and said what they want.

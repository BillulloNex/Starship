import type { SkillCatalogEntry } from "@openhands/extensions/skills";

const DEPLOY_TO_CLOUDFLARE_PAGES_CONTENT = `# Deploy to Cloudflare Pages (\`*.pages.dev\`)

This skill provides fast, reliable, permanent edge deployment for any static web application or game created in GrokBot.

## Why Cloudflare Pages?
- **Permanent 24/7/365 Uptime:** Unlike container preview links (\`p8080.beenex.org\`), Cloudflare Pages links never expire and never die when a container sleeps or a bash session terminates.
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

### Option 1: Using the Built-in \`grokbot-deploy\` Tool (Recommended)

Run \`grokbot-deploy\` pointing at your project directory:

\`\`\`bash
grokbot-deploy ./workspace --name <clean-app-slug>
\`\`\`
or from a build directory:
\`\`\`bash
grokbot-deploy ./dist --name <clean-app-slug>
\`\`\`

### Option 2: Using \`grokbot-app\` CLI
\`\`\`bash
grokbot-app deploy-pages ./workspace --name <clean-app-slug>
\`\`\`

### Option 3: Using Direct Wrangler CLI
\`\`\`bash
npx -y wrangler@latest pages deploy ./workspace --project-name=<clean-app-slug> --commit-dirty=true
\`\`\`

---

## Guidelines for Naming & Output

1. **Slug Convention:**
   - Use clean, lowercase, alphanumeric slugs with hyphens: e.g. \`space-invaders-arcade\`, \`retro-synth-piano\`, \`cyber-pong-game\`.
   - Avoid special characters, spaces, or leading/trailing hyphens.

2. **Directory Requirements:**
   - Make sure an \`index.html\` file exists in the directory being deployed.
   - For frameworks (Vite, React, Vue, Svelte), run the build step first (\`npm run build\`) and deploy the output directory (\`./dist\` or \`./build\`).

3. **Deliver the URL in the Final Response:**
   - Always highlight the permanent public URL clearly:
   > 🎮 **Play Online:** [https://<clean-app-slug>.pages.dev](https://<clean-app-slug>.pages.dev)  
   > ⚡ *Deployed to Cloudflare Pages — permanent 24/7 global hosting.*

---

## Prohibited Anti-Patterns
- **NEVER** run \`python3 -m http.server 8080\` in the workspace root when asked for a shareable link. Subshell commands terminate when the turn finishes, causing the link to break immediately.
- **NEVER** give the user \`http://localhost:<port>\` — they cannot reach your container's loopback interface.
- **NEVER** use \`GITHUB_TOKEN\` or \`GITHUB_PERSONAL_ACCESS_TOKEN\` to create a new public GitHub repository or enable GitHub Pages for user demos/previews unless the user explicitly requests: *"Create a GitHub repository"*.
`;

const IP_AS_LOGO_CONTENT = `# IP as Logo

Create the simplest possible cute IP character: a compact, lovable symbol that remains recognizable at \`32 × 32\`, not a detailed character illustration.

## Workflow

1. Parse the request for an explicit IP subject and available product context. Do not ask the user to choose a color mode unless they explicitly want to control it.
2. When the user has not specified an IP subject and the current workspace is a product repository, inspect relevant read-only context before asking questions. Prefer the README, product docs, package or app metadata, landing-page copy, manifests, and design tokens. Treat context as sufficient when the product purpose, primary audience, and intended personality can be inferred with reasonable confidence.
3. When product context is insufficient, ask one consolidated round of background questions covering what the product does, who it serves, and how it should feel. Do not start a second background questionnaire. Continue with the best supported interpretation after the answer.
4. Once context is sufficient, always present three concise directions before generation and explicitly propose generating six independent candidates in one batch. Do not generate until the user agrees, unless the current request already explicitly authorizes six outputs or asks the agent to proceed without another confirmation.
5. Choose the three proposed directions deliberately:
   - When the user explicitly specifies an IP subject, keep that subject and propose three distinct design treatments based on composition, silhouette treatment, secondary color region, or personality emphasis.
   - When the user does not specify an IP subject, propose three genuinely different IP subjects or metaphors. Tie each one to a different product attribute or brand promise; do not return three arbitrary animals with no rationale.
6. Interpret the user's response exactly:
   - If the user accepts all three directions and the six-image proposal, generate two independent variants per direction and label them \`A1\`, \`A2\`, \`B1\`, \`B2\`, \`C1\`, and \`C2\`.
   - If the user selects one direction but accepts six images, generate six controlled variants of that direction and label them \`A1\` through \`A6\`.
   - If the user rejects the proposed quantity, directions, or distribution, follow the user's replacement instructions without arguing for the default.
7. Default every candidate to exactly three semantic colors in the complete image: exactly two IP base colors plus exactly one background color. Reuse the two IP colors for facial marks rather than introducing additional semantic colors. Follow an explicit user request for another color count. Keep required product cues, identifying features, complexity limits, and any supplied palette consistent enough for useful comparison.
8. Determine the available image-generation path before promising output. In Codex, use ImageGen when it is available. In any other agent environment, use an available configured image generator; if none is available, ask the user whether they can provide or enable one. Do not fabricate generated results.
9. If the runtime supports subagents, parallelize the six independent candidates up to the available concurrency. Give every subagent the same product brief, shared constraints, and one assigned direction or variant; run remaining candidates in subsequent waves when capacity is limited. If subagents are unavailable, generate the candidates through separate image-generation calls or jobs.
10. If the user supplies a background palette, reserve every supplied color for backgrounds unless they explicitly say otherwise. Choose exactly two IP base colors independently for the subject and context unless the user also assigns subject colors. Do not treat any historical or example palette as a closed list of allowed backgrounds.
11. Abstract each subject using the complexity budget below. Generate every candidate as a separate full-resolution square asset; never ask an image model to compose a contact sheet, grid, or multi-image sheet. Do not use previous candidates as image references when testing prompt-only reproducibility.
12. Treat each batch as a one-pass creative draw. Generate every requested candidate once, then preserve and deliver every returned result as-is. Do not inspect outputs to block delivery, classify them as recommended or non-recommended, retry them automatically, or repair them with post-processing.
13. Preserve and label every generated result. Report every label, IP direction and rationale, saved path, prompt/color mapping, and dimensions. Present all results together; generate refinements or replacements only when the user explicitly asks for another draw.

When proposing directions before generation, describe each in one compact line: \`<IP subject> — <product connection> — <defining silhouette>\`. End with a direct proposal to generate six images using the distribution above. Do not turn the discovery phase into a long branding workshop unless the user asks for one.

## Complexity budget

- Build one dominant continuous outer silhouette from roughly \`4–7\` large basic geometric shapes. Merge or delete any shape that does not carry identity, expression, or recognition.
- Use at most one species-defining feature: for example, one large pouch beak, one pair of curled horns, or one broad visor.
- Use at most two broad internal color regions corresponding to the two IP base colors. Keep the face to two eyes and, only when needed for the expression, one tiny mouth. Omit eyebrows, highlights, nostrils, texture, outlines, and decorative marks unless essential for recognition.
- Prefer a head or compact upper-body crop. Do not explain the full anatomy, costume, machinery, or story.
- Remove repeated feathers, scales, fur tufts, armor plates, buttons, screws, numbers, labels, and other illustrative detail.
- Make simplification, cuteness, and an endearing baby-like personality the decisive qualities. Favor a large head, compact proportions, soft cheeks, widely spaced simple eyes, and a calm friendly expression when appropriate to the subject.
`;

export const GROKBOT_BUILTIN_SKILLS: SkillCatalogEntry[] = [
  {
    name: "deploy-to-cloudflare-pages",
    description:
      "Deploy static websites, HTML5 canvas games, landing pages, React/Vite SPAs, and client-side web apps to permanent, 24/7/365 Cloudflare Pages hosting. Use whenever the user asks for a sharable link, asks to host/deploy a game or web app, or wants a permanent public URL.",
    triggers: [
      "sharable link",
      "shareable link",
      "host this",
      "deploy",
      "pages.dev",
      "publish to the web",
      "cloudflare pages",
      "make a playable game",
      "send to friends",
    ],
    category: "integrations",
    content: DEPLOY_TO_CLOUDFLARE_PAGES_CONTENT,
  },
  {
    name: "ip-as-logo",
    description:
      "Generate extremely simple, cute, personified square character images with rounded heavy forms, two purposeful character colors, and one solid background color. Use when creating an animal, creature, robot, ghost, plant, object, or other character image.",
    triggers: [
      "logo",
      "ip logo",
      "brand mascot",
      "character logo",
      "cute logo",
      "mascot",
    ],
    category: "design",
    content: IP_AS_LOGO_CONTENT,
  },
];

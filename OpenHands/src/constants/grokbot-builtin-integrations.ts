import type { IntegrationCatalogEntry as MarketplaceEntry } from "@openhands/extensions/integrations";

export const GROKBOT_BUILTIN_INTEGRATIONS: MarketplaceEntry[] = [
  {
    id: "playwright-browser",
    name: "Playwright Chrome Browser",
    description:
      "Full-fidelity Chrome browser control: mouse hover, drag-and-drop, key combos, script evaluation, screenshots, and file uploads.",
    docsUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/playwright",
    iconBg: "#2EAD33",
    logoUrl: "https://cdn.simpleicons.org/googlechrome/FFFFFF",
    popularityRank: 100,
    keywords: [
      "browser",
      "chrome",
      "playwright",
      "automation",
      "devtools",
      "scraping",
      "hover",
      "upload",
    ],
    connectionOptions: [
      {
        id: "none",
        provider: "mcp",
        transport: {
          kind: "stdio",
          serverName: "playwright",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-playwright"],
        },
        auth: {
          strategy: "none",
        },
      },
    ],
  },
];

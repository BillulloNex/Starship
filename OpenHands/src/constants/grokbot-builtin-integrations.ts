import type { IntegrationCatalogEntry as MarketplaceEntry } from "@openhands/extensions/integrations";

const GOOGLE_WORKSPACE_INSTALL_HINT =
  "Create a Google Cloud OAuth 2.0 Web application client, enable this product's API and MCP API, then paste the client ID and secret. Add any redirect URI shown in the OAuth popup error to Authorized redirect URIs. Use Internal audience, or External with your account as a test user. One client can be reused for Gmail, Drive, and Docs.";

function googleWorkspaceRemoteMcp(options: {
  id: string;
  name: string;
  description: string;
  docsUrl: string;
  url: string;
  logoSlug: string;
  popularityRank: number;
  keywords: string[];
  scopes: string[];
}): MarketplaceEntry {
  return {
    id: options.id,
    name: options.name,
    description: options.description,
    categories: ["Productivity", "Business"],
    docsUrl: options.docsUrl,
    iconBg: "#4285F4",
    logoUrl: `https://cdn.simpleicons.org/${options.logoSlug}/FFFFFF`,
    popularityRank: options.popularityRank,
    keywords: options.keywords,
    installHint: GOOGLE_WORKSPACE_INSTALL_HINT,
    connectionOptions: [
      {
        id: "oauth",
        provider: "mcp",
        transport: {
          kind: "shttp",
          url: options.url,
        },
        auth: {
          strategy: "oauth2",
          oauth: {
            // Confidential web client — install modal collects ID + secret.
            // Omitting authorizationUrl keeps this locally installable.
            clientAuthentication: "body",
            scopes: options.scopes,
          },
        },
      },
    ],
  };
}

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

  // ── Firebase ──────────────────────────────────────────────────────────
  // Verified: npx firebase-tools@latest mcp --help
  // Auth: Optional CI token (firebase login:ci) or interactive firebase_login
  {
    id: "firebase",
    name: "Firebase",
    description:
      "Full Firebase suite — Firestore, Auth, Storage, Functions, Hosting, Remote Config, and more — via the official Firebase CLI MCP server.",
    categories: ["Developer tools", "Cloud"],
    docsUrl: "https://firebase.google.com/docs/cli",
    iconBg: "#FF9100",
    logoUrl: "https://cdn.simpleicons.org/firebase/FFFFFF",
    popularityRank: 95,
    keywords: [
      "firebase",
      "firestore",
      "auth",
      "storage",
      "functions",
      "hosting",
      "google",
    ],
    installHint:
      "Optionally provide a CI token (firebase login:ci) for reliable headless auth. Without it, the agent can use the built-in firebase_login tool for interactive browser auth.",
    connectionOptions: [
      {
        id: "api",
        provider: "mcp",
        transport: {
          kind: "stdio",
          serverName: "firebase",
          command: "npx",
          args: ["-y", "firebase-tools@latest", "mcp"],
          envFields: [
            {
              key: "FIREBASE_TOKEN",
              label: "Firebase CI token",
              type: "password",
              placeholder: "1//0abc...",
              helperText:
                "Generate with: firebase login:ci. Optional — without it the agent can log in interactively.",
              required: false,
            },
          ],
        },
        auth: {
          strategy: "api_key",
        },
      },
    ],
  },

  // ── Google Cloud Platform ─────────────────────────────────────────────
  // Verified: googleapis/gcloud-mcp README, npx @google-cloud/gcloud-mcp --help
  // Auth: Optional service account key path or pre-existing gcloud auth / ADC
  {
    id: "google-cloud",
    name: "Google Cloud",
    description:
      "Interact with Google Cloud infrastructure and services using natural language via the official gcloud MCP server.",
    categories: ["Cloud", "Developer tools"],
    docsUrl: "https://github.com/googleapis/gcloud-mcp",
    iconBg: "#4285F4",
    logoUrl: "https://cdn.simpleicons.org/googlecloud/FFFFFF",
    popularityRank: 94,
    keywords: [
      "gcp",
      "google-cloud",
      "gcloud",
      "compute",
      "storage",
      "bigquery",
      "kubernetes",
    ],
    installHint:
      "Requires the gcloud CLI installed and authenticated. Optionally provide a service account key for headless auth.",
    connectionOptions: [
      {
        id: "api",
        provider: "mcp",
        transport: {
          kind: "stdio",
          serverName: "gcloud",
          command: "npx",
          args: ["-y", "@google-cloud/gcloud-mcp"],
          envFields: [
            {
              key: "GOOGLE_APPLICATION_CREDENTIALS",
              label: "Service account key path",
              type: "text",
              placeholder: "/path/to/service-account-key.json",
              helperText:
                "Path to a GCP service account JSON key file. Optional — without it the server uses existing gcloud auth.",
              helperLink:
                "https://cloud.google.com/iam/docs/keys-create-delete",
              required: false,
            },
          ],
        },
        auth: {
          strategy: "api_key",
        },
      },
    ],
  },

  // ── Coolify ───────────────────────────────────────────────────────────
  // Verified: @masonator/coolify-mcp@2.19.4 dist/index.js source code
  // Auth: Required COOLIFY_ACCESS_TOKEN + COOLIFY_BASE_URL
  {
    id: "coolify",
    name: "Coolify",
    description:
      "Self-hosted PaaS management: deploy, monitor, and manage applications, databases, and services on your Coolify instance.",
    categories: ["Cloud", "DevOps"],
    docsUrl: "https://coolify.io/docs",
    iconBg: "#6B16ED",
    logoUrl: "https://cdn.simpleicons.org/coolify/FFFFFF",
    popularityRank: 93,
    keywords: [
      "coolify",
      "self-hosted",
      "paas",
      "deploy",
      "docker",
      "infrastructure",
    ],
    connectionOptions: [
      {
        id: "api",
        provider: "mcp",
        transport: {
          kind: "stdio",
          serverName: "coolify",
          command: "npx",
          args: ["-y", "@masonator/coolify-mcp@latest"],
          envFields: [
            {
              key: "COOLIFY_BASE_URL",
              label: "Coolify instance URL",
              type: "text",
              placeholder: "https://coolify.example.com",
              helperText:
                "The base URL of your Coolify dashboard (e.g. https://coolify.example.com).",
              required: true,
            },
            {
              key: "COOLIFY_ACCESS_TOKEN",
              label: "Coolify API token",
              type: "password",
              placeholder: "your-coolify-api-token",
              helperText:
                "Generate under Settings → API Tokens in your Coolify dashboard.",
              helperLink: "https://coolify.io/docs/api/authentication",
              required: true,
            },
          ],
        },
        auth: {
          strategy: "api_key",
        },
      },
    ],
  },

  // ── Google Workspace remote MCP (official, developer preview) ─────────
  // Verified: https://developers.google.com/workspace/guides/configure-mcp-servers
  // Auth: Google Cloud OAuth web client (client ID + secret). Do NOT set
  // authorizationUrl/tokenUrl — those hide the card from local /mcp installs.
  googleWorkspaceRemoteMcp({
    id: "gmail",
    name: "Gmail",
    description:
      "Search threads, read mail, list labels, and create drafts in your Gmail inbox.",
    docsUrl:
      "https://developers.google.com/workspace/gmail/api/guides/configure-mcp-server",
    url: "https://gmailmcp.googleapis.com/mcp/v1",
    logoSlug: "gmail",
    popularityRank: 110,
    keywords: ["gmail", "email", "inbox", "mail", "google", "workspace"],
    scopes: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.compose",
    ],
  }),
  googleWorkspaceRemoteMcp({
    id: "google-drive",
    name: "Google Drive",
    description:
      "Search Drive, list recent files, and read file content — including Meet notes stored as Docs.",
    docsUrl:
      "https://developers.google.com/workspace/drive/api/guides/configure-mcp-server",
    url: "https://drivemcp.googleapis.com/mcp/v1",
    logoSlug: "googledrive",
    popularityRank: 109,
    keywords: [
      "drive",
      "google-drive",
      "files",
      "meet notes",
      "google",
      "workspace",
    ],
    scopes: [
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/drive.file",
    ],
  }),
  googleWorkspaceRemoteMcp({
    id: "google-docs",
    name: "Google Docs",
    description:
      "Read Google Docs bodies. Use with Drive to open Meet notes and other documents.",
    docsUrl:
      "https://developers.google.com/workspace/docs/api/guides/configure-mcp-server",
    url: "https://docsmcp.googleapis.com/mcp/v1",
    logoSlug: "googledocs",
    popularityRank: 108,
    keywords: ["docs", "google-docs", "meet notes", "google", "workspace"],
    scopes: [
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/documents.readonly",
      "https://www.googleapis.com/auth/documents",
    ],
  }),
];

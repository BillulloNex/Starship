import { describe, expect, it } from "vitest";
import { AUTOMATION_CATALOG } from "@openhands/extensions/automations";
import { INTEGRATION_CATALOG } from "@openhands/extensions/integrations";
import { SETUP_REGISTRY } from "#/manifests/manifest-sources";
import { getIntegrationIds } from "#/utils/automation-catalog";
import {
  getDefaultMcpTransport,
  getInstallableMcpConnectionOption,
  getMcpMarketplaceCatalog,
} from "#/utils/mcp-marketplace-utils";

describe("OpenHands extensions catalogs", () => {
  it("hydrates the MCP marketplace from @openhands/extensions", () => {
    expect(INTEGRATION_CATALOG.length).toBeGreaterThan(0);

    const github = INTEGRATION_CATALOG.find((entry) => entry.id === "github");
    expect(getDefaultMcpTransport(github!)?.kind).toBe("shttp");
    expect(github?.logoUrl).toBe("https://cdn.simpleicons.org/github/FFFFFF");
  });

  it("patches Slack to the maintained docs and npm package", () => {
    const slack = INTEGRATION_CATALOG.find((entry) => entry.id === "slack");
    expect(slack?.docsUrl).toBe(
      "https://github.com/zencoderai/slack-mcp-server",
    );
    const apiOption = slack?.connectionOptions.find(
      (option) => option.id === "api" && option.transport?.kind === "stdio",
    );
    expect(apiOption?.transport?.kind).toBe("stdio");
    if (apiOption?.transport?.kind !== "stdio") {
      throw new Error("Slack API option should be stdio");
    }
    expect(apiOption.transport.args).toContain("@zencoderai/slack-mcp-server");
    expect(apiOption.transport.args).not.toContain(
      "@modelcontextprotocol/server-slack",
    );
  });

  it("loads Linear streamable HTTP /mcp endpoint with bearer auth", () => {
    const catalog = getMcpMarketplaceCatalog(INTEGRATION_CATALOG);
    const linear = catalog.find((entry) => entry.id === "linear")!;

    const mcpOption = getInstallableMcpConnectionOption(linear)!;

    expect(mcpOption.transport).toEqual({
      kind: "shttp",
      url: "https://mcp.linear.app/mcp",
      apiKeyOptional: true,
    });
    expect(linear.docsUrl).toBe("https://linear.app/docs/mcp");
    expect(mcpOption.auth.strategy).toBe("bearer");
    expect(
      linear.connectionOptions.some((option) => option.transport?.kind === "sse"),
    ).toBe(false);
  });

  it("drops deprecated MCP entries that no longer have maintained replacements", () => {
    const catalogIds = new Set(
      getMcpMarketplaceCatalog(INTEGRATION_CATALOG).map((entry) => entry.id),
    );

    expect(catalogIds.has("gitlab")).toBe(false);
    expect(catalogIds.has("google-maps")).toBe(false);
    expect(catalogIds.has("postgres")).toBe(false);
    expect(catalogIds.has("puppeteer")).toBe(false);
    expect(catalogIds.has("sqlite")).toBe(false);
  });

  it("loads recommended automations from @openhands/extensions", () => {
    expect(AUTOMATION_CATALOG.length).toBeGreaterThan(0);

    const knownMcpIds = new Set(INTEGRATION_CATALOG.map((entry) => entry.id));
    for (const automation of AUTOMATION_CATALOG) {
      const integrationIds = getIntegrationIds(automation);
      expect(integrationIds.length).toBeGreaterThan(0);
      expect(integrationIds.every((id) => knownMcpIds.has(id))).toBe(true);
    }
  });

  it("admits every setup experience the automation catalog ships", () => {
    // Arrange — the pinned package is the whole source of setup manifests, and
    // a shipped one that fails admission is dropped silently.
    const shipped = AUTOMATION_CATALOG.filter(
      (automation) => !!automation.setup,
    );
    expect(shipped.length).toBeGreaterThan(0);

    // Act / Assert
    expect(SETUP_REGISTRY.entries.map((entry) => entry.id)).toEqual(
      shipped.map((automation) => automation.id),
    );
  });

  // ── Grokbot builtin MCP integrations ──────────────────────────────────

  it("hydrates Firebase into the MCP marketplace with stdio transport", () => {
    const catalog = getMcpMarketplaceCatalog(INTEGRATION_CATALOG);
    const firebase = catalog.find((entry) => entry.id === "firebase")!;
    expect(firebase).toBeDefined();
    expect(firebase.name).toBe("Firebase");

    const option = getInstallableMcpConnectionOption(firebase)!;
    expect(option.transport?.kind).toBe("stdio");
    if (option.transport?.kind !== "stdio") throw new Error("expected stdio");
    expect(option.transport.command).toBe("npx");
    expect(option.transport.args).toContain("firebase-tools@latest");
    expect(option.transport.args).toContain("mcp");
    expect(option.transport.serverName).toBe("firebase");

    // FIREBASE_TOKEN is optional
    const tokenField = option.transport.envFields?.find(
      (f) => f.key === "FIREBASE_TOKEN",
    );
    expect(tokenField).toBeDefined();
    expect(tokenField!.required).toBe(false);
    expect(tokenField!.type).toBe("password");
  });

  it("hydrates Google Cloud into the MCP marketplace with stdio transport", () => {
    const catalog = getMcpMarketplaceCatalog(INTEGRATION_CATALOG);
    const gcloud = catalog.find((entry) => entry.id === "google-cloud")!;
    expect(gcloud).toBeDefined();
    expect(gcloud.name).toBe("Google Cloud");

    const option = getInstallableMcpConnectionOption(gcloud)!;
    expect(option.transport?.kind).toBe("stdio");
    if (option.transport?.kind !== "stdio") throw new Error("expected stdio");
    expect(option.transport.command).toBe("npx");
    expect(option.transport.args).toContain("@google-cloud/gcloud-mcp");
    expect(option.transport.serverName).toBe("gcloud");

    // GOOGLE_APPLICATION_CREDENTIALS is optional
    const credField = option.transport.envFields?.find(
      (f) => f.key === "GOOGLE_APPLICATION_CREDENTIALS",
    );
    expect(credField).toBeDefined();
    expect(credField!.required).toBe(false);
  });

  it("hydrates Coolify into the MCP marketplace with required env fields", () => {
    const catalog = getMcpMarketplaceCatalog(INTEGRATION_CATALOG);
    const coolify = catalog.find((entry) => entry.id === "coolify")!;
    expect(coolify).toBeDefined();
    expect(coolify.name).toBe("Coolify");

    const option = getInstallableMcpConnectionOption(coolify)!;
    expect(option.transport?.kind).toBe("stdio");
    if (option.transport?.kind !== "stdio") throw new Error("expected stdio");
    expect(option.transport.command).toBe("npx");
    expect(option.transport.args).toContain("@masonator/coolify-mcp@latest");
    expect(option.transport.serverName).toBe("coolify");

    // Both Coolify env fields are required
    const baseUrl = option.transport.envFields?.find(
      (f) => f.key === "COOLIFY_BASE_URL",
    );
    const token = option.transport.envFields?.find(
      (f) => f.key === "COOLIFY_ACCESS_TOKEN",
    );
    expect(baseUrl).toBeDefined();
    expect(baseUrl!.required).toBe(true);
    expect(token).toBeDefined();
    expect(token!.required).toBe(true);
    expect(token!.type).toBe("password");
  });
});

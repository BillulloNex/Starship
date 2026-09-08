import { describe, expect, it } from "vitest";
import {
  getGoogleWorkspaceOAuthClient,
  injectGoogleWorkspaceOAuthClient,
  isGoogleWorkspaceMcpUrl,
  shouldInterceptGoogleWorkspaceMcp,
} from "../../scripts/google-workspace-oauth.mjs";

describe("google-workspace-oauth.mjs", () => {
  it("recognizes official Google Workspace MCP hosts", () => {
    expect(
      isGoogleWorkspaceMcpUrl("https://gmailmcp.googleapis.com/mcp/v1"),
    ).toBe(true);
    expect(
      isGoogleWorkspaceMcpUrl("https://drivemcp.googleapis.com/mcp/v1"),
    ).toBe(true);
    expect(isGoogleWorkspaceMcpUrl("https://mcp.slack.com/mcp")).toBe(false);
  });

  it("intercepts MCP OAuth start and test POSTs only", () => {
    expect(
      shouldInterceptGoogleWorkspaceMcp({
        method: "POST",
        url: "/api/mcp/oauth/start",
      }),
    ).toBe(true);
    expect(
      shouldInterceptGoogleWorkspaceMcp({
        method: "GET",
        url: "/api/mcp/oauth/start",
      }),
    ).toBe(false);
    expect(
      shouldInterceptGoogleWorkspaceMcp({
        method: "POST",
        url: "/api/settings",
      }),
    ).toBe(false);
  });

  it("injects Coolify client credentials onto Gmail OAuth start bodies", () => {
    const result = injectGoogleWorkspaceOAuthClient(
      {
        name: "gmail",
        server: {
          type: "http",
          url: "https://gmailmcp.googleapis.com/mcp/v1",
          auth: {
            strategy: "oauth2",
            authentication: {
              type: "oauth",
              client_auth_method: "client_secret_post",
              scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
            },
          },
        },
      },
      {
        GOOGLE_OAUTH_CLIENT_ID: "id.apps.googleusercontent.com",
        GOOGLE_OAUTH_CLIENT_SECRET: "gsecret",
      },
    );
    expect(result.ok).toBe(true);
    expect(result.injected).toBe(true);
    expect(result.body.server.auth.authentication).toMatchObject({
      client_id: "id.apps.googleusercontent.com",
      client_secret: "gsecret",
    });
  });

  it("does not inject into unrelated MCP servers", () => {
    const body = {
      server: { type: "http", url: "https://mcp.linear.app/mcp" },
    };
    const result = injectGoogleWorkspaceOAuthClient(body, {
      GOOGLE_OAUTH_CLIENT_ID: "id.apps.googleusercontent.com",
      GOOGLE_OAUTH_CLIENT_SECRET: "gsecret",
    });
    expect(result).toEqual({ ok: true, injected: false, body });
  });

  it("fails closed when Google env is missing", () => {
    expect(getGoogleWorkspaceOAuthClient({})).toBeNull();
    const result = injectGoogleWorkspaceOAuthClient(
      {
        server: {
          type: "http",
          url: "https://gmailmcp.googleapis.com/mcp/v1",
        },
      },
      {},
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("missing_env");
  });
});

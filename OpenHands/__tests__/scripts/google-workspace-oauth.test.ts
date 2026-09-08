import { describe, expect, it } from "vitest";
import {
  getActiveMcpOAuthCallbackPort,
  getGoogleWorkspaceOAuthClient,
  getMcpOAuthCallbackPort,
  getMcpOAuthRedirectUri,
  injectGoogleWorkspaceOAuthClient,
  isGoogleWorkspaceMcpUrl,
  rememberMcpOAuthCallbackUrl,
  rewriteOAuthAuthorizationUrl,
  shouldInterceptGoogleWorkspaceMcp,
  shouldProxyMcpOAuthPublicCallback,
  shouldSniffMcpOAuthStatus,
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
      additional_client_metadata: {
        redirect_uris: ["https://ship.beenex.org/callback"],
      },
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

  it("proxies Google's public OAuth callback paths to the FastMCP listener", () => {
    expect(
      shouldProxyMcpOAuthPublicCallback({
        method: "GET",
        url: "/callback?code=abc&state=xyz",
      }),
    ).toBe(true);
    expect(
      shouldProxyMcpOAuthPublicCallback({
        method: "GET",
        url: "/mcp/gmail/callback?code=abc&state=xyz",
      }),
    ).toBe(true);
    expect(
      shouldProxyMcpOAuthPublicCallback({
        method: "GET",
        url: "/callback/",
      }),
    ).toBe(true);
    expect(
      shouldProxyMcpOAuthPublicCallback({
        method: "POST",
        url: "/callback?code=abc",
      }),
    ).toBe(false);
    expect(
      shouldProxyMcpOAuthPublicCallback({
        method: "GET",
        url: "/mcp",
      }),
    ).toBe(false);
  });

  it("pins the FastMCP callback listener to a Coolify-configured port", () => {
    expect(getMcpOAuthCallbackPort({})).toBe(18765);
    expect(
      getMcpOAuthCallbackPort({ GROKBOT_MCP_OAUTH_CALLBACK_PORT: "19001" }),
    ).toBe(19001);
    expect(
      getMcpOAuthCallbackPort({ GROKBOT_MCP_OAUTH_CALLBACK_PORT: "nope" }),
    ).toBe(18765);
  });

  it("rewrites FastMCP's loopback redirect_uri onto the public Starship callback", () => {
    expect(getMcpOAuthRedirectUri({})).toBe("");
    expect(
      getMcpOAuthRedirectUri({
        GOOGLE_OAUTH_CLIENT_ID: "id.apps.googleusercontent.com",
      }),
    ).toBe("https://ship.beenex.org/callback");
    const rewritten = rewriteOAuthAuthorizationUrl(
      "https://accounts.google.com/o/oauth2/v2/auth?client_id=x&redirect_uri=http%3A%2F%2Flocalhost%3A58845%2Fcallback&state=abc",
      "https://ship.beenex.org/callback",
    );
    const parsed = new URL(rewritten);
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "https://ship.beenex.org/callback",
    );
    expect(parsed.searchParams.get("state")).toBe("abc");
  });

  it("forwards Google's public callback to the live FastMCP listener port", () => {
    expect(
      shouldSniffMcpOAuthStatus({
        method: "GET",
        url: "/api/mcp/oauth/status/job-1",
      }),
    ).toBe(true);
    expect(
      shouldSniffMcpOAuthStatus({
        method: "POST",
        url: "/api/mcp/oauth/status/job-1",
      }),
    ).toBe(false);
    expect(rememberMcpOAuthCallbackUrl("http://localhost:54207/callback")).toBe(
      54207,
    );
    expect(getActiveMcpOAuthCallbackPort({})).toBe(54207);
  });
});

import { describe, expect, it } from "vitest";
import {
  buildGithubAppInstallUrl,
  buildGithubAppManifest,
  buildGithubAuthorizeUrl,
  GITHUB_OAUTH_API_PREFIX,
  GITHUB_OAUTH_SCOPES,
  getCallbackUrl,
  getPublicOrigin,
  mapGithubBranch,
  mapGithubRepo,
  parseGithubOAuthPath,
  publicStatus,
  workspacePathForRepo,
} from "../../scripts/github-oauth.mjs";

describe("github-oauth.mjs", () => {
  it("parses GitHub OAuth routes", () => {
    expect(parseGithubOAuthPath("/api/github")).toEqual({ kind: "root" });
    expect(parseGithubOAuthPath("/api/github/oauth/status")).toEqual({
      kind: "status",
    });
    expect(parseGithubOAuthPath("/api/github/oauth/start")).toEqual({
      kind: "start",
    });
    expect(parseGithubOAuthPath("/api/github/oauth/callback")).toEqual({
      kind: "callback",
    });
    expect(parseGithubOAuthPath("/api/github/oauth/setup")).toEqual({
      kind: "setup",
    });
    expect(parseGithubOAuthPath("/api/github/oauth/disconnect")).toEqual({
      kind: "disconnect",
    });
    expect(parseGithubOAuthPath("/api/github/repos")).toEqual({
      kind: "repos",
    });
    expect(
      parseGithubOAuthPath("/api/github/repos/BillulloNex/Starship/branches"),
    ).toEqual({
      kind: "branches",
      owner: "BillulloNex",
      repo: "Starship",
    });
    expect(parseGithubOAuthPath("/api/github/ensure-workspace")).toEqual({
      kind: "ensure-workspace",
    });
    expect(parseGithubOAuthPath("/api/github/webhook")).toEqual({
      kind: "webhook",
    });
    expect(parseGithubOAuthPath("/api/jobs")).toBeNull();
  });

  it("builds the classic OAuth authorize URL", () => {
    const url = new URL(
      buildGithubAuthorizeUrl({
        clientId: "abc",
        redirectUri: "https://ship.beenex.org/api/github/oauth/callback",
        state: "csrf",
      }),
    );
    expect(url.origin).toBe("https://github.com");
    expect(url.pathname).toBe("/login/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("abc");
    expect(url.searchParams.get("state")).toBe("csrf");
    expect(url.searchParams.get("scope")).toBe(GITHUB_OAUTH_SCOPES);
  });

  it("keeps the GitHub App install CSRF state on the install URL", () => {
    const url = new URL(
      buildGithubAppInstallUrl("starship", { state: "install-csrf" }),
    );
    expect(url.pathname).toBe("/apps/starship/installations/new");
    expect(url.searchParams.get("state")).toBe("install-csrf");
  });

  it("builds a GitHub App manifest pointed at Starship", () => {
    const manifest = buildGithubAppManifest({
      GITHUB_OAUTH_PUBLIC_ORIGIN: "https://ship.beenex.org",
    });
    expect(manifest.name).toBe("Starship");
    expect(manifest.request_oauth_on_install).toBe(true);
    expect(manifest.callback_urls).toEqual([
      "https://ship.beenex.org/api/github/oauth/callback",
    ]);
    expect(manifest.default_permissions).toMatchObject({
      contents: "write",
      pull_requests: "write",
    });
  });

  it("maps GitHub repos and branches into canvas types", () => {
    expect(
      mapGithubRepo({
        id: 9,
        full_name: "BillulloNex/Starship",
        private: true,
        default_branch: "main",
        stargazers_count: 3,
        pushed_at: "2026-01-01T00:00:00Z",
      }),
    ).toEqual({
      id: "9",
      full_name: "BillulloNex/Starship",
      git_provider: "github",
      is_public: false,
      stargazers_count: 3,
      pushed_at: "2026-01-01T00:00:00Z",
      main_branch: "main",
    });
    expect(
      mapGithubBranch({
        name: "main",
        commit: { sha: "abc" },
        protected: true,
      }),
    ).toEqual({
      name: "main",
      commit_sha: "abc",
      protected: true,
    });
    expect(mapGithubRepo({})).toBeNull();
  });

  it("reports public connection status without leaking tokens", () => {
    expect(publicStatus(null, null, null)).toEqual({
      configured: false,
      connected: false,
      login: null,
      name: null,
      avatarUrl: null,
      mode: "unset",
    });
    const status = publicStatus(
      {
        login: "octocat",
        name: "The Octocat",
        avatarUrl: "https://example.com/a.png",
        userToken: "secret",
      },
      { clientId: "id", clientSecret: "secret", kind: "oauth_app" },
      null,
    );
    expect(status).toEqual({
      configured: true,
      connected: true,
      login: "octocat",
      name: "The Octocat",
      avatarUrl: "https://example.com/a.png",
      mode: "oauth_app",
    });
    expect(JSON.stringify(status)).not.toContain("secret");
  });

  it("clones repositories under /projects basename", () => {
    expect(
      workspacePathForRepo("BillulloNex/BeeNex-Homepage-v2", {
        GITHUB_WORKSPACE_ROOT: "/projects",
      }),
    ).toBe("/projects/BeeNex-Homepage-v2");
  });

  it("uses the public Starship origin for callbacks", () => {
    expect(getPublicOrigin({})).toBe("https://ship.beenex.org");
    expect(getCallbackUrl({})).toBe(
      `https://ship.beenex.org${GITHUB_OAUTH_API_PREFIX}/oauth/callback`,
    );
    expect(
      getPublicOrigin({
        GROKBOT_MCP_OAUTH_REDIRECT_URI: "https://ship.beenex.org/callback",
      }),
    ).toBe("https://ship.beenex.org");
  });
});

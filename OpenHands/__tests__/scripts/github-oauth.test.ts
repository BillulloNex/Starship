import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildGithubAppInstallUrl,
  buildGithubAppManifest,
  buildGithubAuthorizeUrl,
  GITHUB_OAUTH_API_PREFIX,
  GITHUB_OAUTH_SCOPES,
  getAgentSecretTarget,
  getCallbackUrl,
  getGithubConnectionPath,
  getPublicOrigin,
  isGithubUserOAuthToken,
  mapGithubBranch,
  mapGithubRepo,
  parseGithubOAuthPath,
  publicStatus,
  readEnvGithubToken,
  resolveAccessToken,
  shouldRefreshGithubConnection,
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

  it("does not let sandbox GITHUB_TOKEN skip GitHub token refresh", async () => {
    const helper = await readFile(
      path.join(process.cwd(), "scripts/github-git-credential.sh"),
      "utf8",
    );
    expect(helper).toContain(
      "env -u GITHUB_TOKEN -u GITHUB_PERSONAL_ACCESS_TOKEN -u GH_TOKEN",
    );
    expect(helper).toContain("credential-token");
  });

  it("treats GitHub App user tokens as OAuth, not PATs", () => {
    expect(isGithubUserOAuthToken("ghu_expired")).toBe(true);
    expect(isGithubUserOAuthToken("gho_oauth")).toBe(true);
    expect(isGithubUserOAuthToken("ghp_pat")).toBe(false);
    expect(isGithubUserOAuthToken("github_pat_fine")).toBe(false);
    expect(readEnvGithubToken({ GITHUB_TOKEN: "ghu_stale" })).toBe("ghu_stale");
  });

  it("refreshes expired GitHub App connections instead of treating missing expiry as forever-fresh", () => {
    const now = Date.parse("2026-09-20T03:00:00.000Z");
    expect(
      shouldRefreshGithubConnection(
        {
          userToken: "ghu_live",
          refreshToken: "r1",
          userTokenExpiresAt: "2026-09-20T04:00:00.000Z",
        },
        now,
      ),
    ).toBe(false);
    expect(
      shouldRefreshGithubConnection(
        {
          userToken: "ghu_expired",
          refreshToken: "r1",
          userTokenExpiresAt: "2026-09-20T02:00:00.000Z",
        },
        now,
      ),
    ).toBe(true);
    expect(
      shouldRefreshGithubConnection(
        {
          userToken: "ghu_unknown_expiry",
          refreshToken: "r1",
          userTokenExpiresAt: null,
        },
        now,
      ),
    ).toBe(true);
  });

  it("reads the agent-server secret target from env", () => {
    expect(
      getAgentSecretTarget({
        GROKBOT_AGENT_SERVER_URL: "http://127.0.0.1:18000",
        LOCAL_BACKEND_API_KEY: "session",
      }),
    ).toEqual({
      agentServerUrl: "http://127.0.0.1:18000",
      sessionApiKey: "session",
    });
  });
});

describe("resolveAccessToken", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("refreshes an expired connection even when sandbox env still has a stale ghu_ token", async () => {
    const tmp = await mkdtemp(path.join(tmpdir(), "github-oauth-"));
    const env = {
      OH_PERSISTENCE_DIR: tmp,
      GITHUB_OAUTH_CLIENT_ID: "client",
      GITHUB_OAUTH_CLIENT_SECRET: "secret",
      GROKBOT_AGENT_SERVER_URL: "http://127.0.0.1:18000",
      LOCAL_BACKEND_API_KEY: "session-key",
      GITHUB_TOKEN: "ghu_stale",
      GITHUB_PERSONAL_ACCESS_TOKEN: "ghu_stale",
    };
    await writeFile(
      getGithubConnectionPath(env),
      `${JSON.stringify({
        login: "octocat",
        userToken: "ghu_stale",
        refreshToken: "refresh-old",
        userTokenExpiresAt: "2020-01-01T00:00:00.000Z",
        agentServerUrl: "http://127.0.0.1:18000",
        sessionApiKey: "session-key",
      })}\n`,
    );

    const secretPuts = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) => {
        const href = String(url);
        if (href.includes("login/oauth/access_token")) {
          return new Response(
            JSON.stringify({
              access_token: "ghu_fresh",
              refresh_token: "refresh-new",
              expires_in: 28800,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (href.includes("/api/settings/secrets")) {
          secretPuts.push(JSON.parse(String(init?.body ?? "{}")));
          return new Response("{}", { status: 200 });
        }
        return new Response("not found", { status: 404 });
      }),
    );

    await expect(resolveAccessToken(env)).resolves.toBe("ghu_fresh");
    const saved = JSON.parse(
      await readFile(getGithubConnectionPath(env), "utf8"),
    );
    expect(saved.userToken).toBe("ghu_fresh");
    expect(saved.refreshToken).toBe("refresh-new");
    expect(secretPuts.map((row) => row.name).sort()).toEqual([
      "GITHUB_PERSONAL_ACCESS_TOKEN",
      "GITHUB_TOKEN",
    ]);
    expect(secretPuts.every((row) => row.value === "ghu_fresh")).toBe(true);
  });

  it("falls back to a PAT in env when no GitHub connection exists", async () => {
    const tmp = await mkdtemp(path.join(tmpdir(), "github-oauth-"));
    await expect(
      resolveAccessToken({
        OH_PERSISTENCE_DIR: tmp,
        GITHUB_TOKEN: "ghp_operator_pat",
      }),
    ).resolves.toBe("ghp_operator_pat");
  });
});

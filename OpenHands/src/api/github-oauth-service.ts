import { getAgentServerBaseUrl } from "#/api/agent-server-config";
import { Branch, BranchPage, GitRepository, RepositoryPage } from "#/types/git";

const GITHUB_ENDPOINT = "/api/github";

export interface GithubConnectionStatus {
  configured: boolean;
  connected: boolean;
  login: string | null;
  name: string | null;
  avatarUrl: string | null;
  mode: "oauth_app" | "github_app" | "unset";
}

export interface GithubWorkspace {
  path: string;
  cloned: boolean;
  full_name: string;
}

export const DISCONNECTED_GITHUB_STATUS: GithubConnectionStatus = {
  configured: false,
  connected: false,
  login: null,
  name: null,
  avatarUrl: null,
  mode: "unset",
};

function githubUrl(path = "") {
  const baseUrl = getAgentServerBaseUrl() ?? "";
  return `${baseUrl}${GITHUB_ENDPOINT}${path}`;
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      (payload as { error?: string }).error ||
        `GitHub request failed (${response.status})`,
    );
  }
  return payload as T;
}

class GitHubOAuthService {
  static startUrl(next = "/settings/app"): string {
    const params = new URLSearchParams({ next });
    return `${githubUrl("/oauth/start")}?${params.toString()}`;
  }

  static async getStatus(): Promise<GithubConnectionStatus> {
    try {
      const response = await fetch(githubUrl("/oauth/status"), {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return DISCONNECTED_GITHUB_STATUS;
      const payload = (await response.json()) as GithubConnectionStatus;
      return {
        configured: Boolean(payload.configured),
        connected: Boolean(payload.connected),
        login: payload.login ?? null,
        name: payload.name ?? null,
        avatarUrl: payload.avatarUrl ?? null,
        mode: payload.mode ?? "unset",
      };
    } catch {
      return DISCONNECTED_GITHUB_STATUS;
    }
  }

  static async disconnect(): Promise<void> {
    const response = await fetch(githubUrl("/oauth/disconnect"), {
      method: "POST",
      headers: { Accept: "application/json" },
    });
    await readJson<{ ok?: boolean }>(response);
  }

  static async listRepos(
    options: {
      query?: string;
      limit?: number;
      pageId?: string;
    } = {},
  ): Promise<RepositoryPage> {
    const params = new URLSearchParams();
    if (options.query) params.set("query", options.query);
    if (options.limit) params.set("limit", String(options.limit));
    if (options.pageId) params.set("page_id", options.pageId);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    const response = await fetch(githubUrl(`/repos${suffix}`), {
      headers: { Accept: "application/json" },
    });
    const payload = await readJson<{
      items?: GitRepository[];
      next_page_id?: string | null;
    }>(response);
    return {
      items: payload.items ?? [],
      next_page_id: payload.next_page_id ?? null,
    };
  }

  static async listBranches(
    repository: string,
    options: { query?: string; limit?: number; pageId?: string } = {},
  ): Promise<BranchPage> {
    const [owner, repo] = repository.split("/");
    if (!owner || !repo) {
      return { items: [], next_page_id: null };
    }
    const params = new URLSearchParams();
    if (options.query) params.set("query", options.query);
    if (options.limit) params.set("limit", String(options.limit));
    if (options.pageId) params.set("page_id", options.pageId);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    const response = await fetch(
      githubUrl(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches${suffix}`,
      ),
      { headers: { Accept: "application/json" } },
    );
    const payload = await readJson<{
      items?: Branch[];
      next_page_id?: string | null;
    }>(response);
    return {
      items: payload.items ?? [],
      next_page_id: payload.next_page_id ?? null,
    };
  }

  static async ensureWorkspace(
    fullName: string,
    branch?: string,
  ): Promise<GithubWorkspace> {
    const response = await fetch(githubUrl("/ensure-workspace"), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        full_name: fullName,
        branch: branch || undefined,
      }),
    });
    return readJson<GithubWorkspace>(response);
  }
}

export default GitHubOAuthService;

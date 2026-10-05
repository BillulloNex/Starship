const GITFLARE_API_BASE = "https://git.beenex.company";
const DEFAULT_GITFLARE_API_KEY = "gf_89e18cd50e6a4039b567a1837bf4aa7d";

export interface GitFlareRepo {
  id: string;
  name: string;
  description: string | null;
  default_branch: string;
  is_private: number;
  artifact_name: string;
  created_at: string;
  updated_at: string;
}

export interface GitFlareRepoListResponse {
  repos: GitFlareRepo[];
  limit: number;
  offset: number;
}

class GitFlareService {
  /**
   * Resolve the active GitFlare API key.
   * Priority: localStorage -> import.meta.env.VITE_GITFLARE_API_KEY -> default key.
   */
  static getApiKey(): string {
    try {
      const stored = localStorage.getItem("gitflare_api_key");
      if (stored) return stored;
    } catch {
      // localStorage may not be available
    }
    return (
      (import.meta.env.VITE_GITFLARE_API_KEY as string | undefined) ||
      DEFAULT_GITFLARE_API_KEY
    );
  }

  /**
   * Save an API key override to localStorage.
   */
  static setApiKey(key: string): void {
    try {
      if (key && key.trim()) {
        localStorage.setItem("gitflare_api_key", key.trim());
      } else {
        localStorage.removeItem("gitflare_api_key");
      }
    } catch {
      // localStorage may not be available
    }
  }

  /**
   * Build headers including authorization.
   */
  private static getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    const key = this.getApiKey();
    if (key) {
      headers["Authorization"] = `Bearer ${key}`;
    }
    return headers;
  }

  /**
   * List all GitFlare repositories.
   */
  static async listRepos(
    limit = 50,
    offset = 0,
  ): Promise<GitFlareRepoListResponse> {
    const url = new URL(`${GITFLARE_API_BASE}/api/repos`);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));

    const response = await fetch(url.toString(), {
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      throw new Error(
        `Failed to fetch GitFlare repos: ${response.status} ${response.statusText}`,
      );
    }
    return response.json();
  }

  /**
   * Get info for a single GitFlare repository.
   */
  static async getRepoInfo(name: string): Promise<GitFlareRepo> {
    const response = await fetch(
      `${GITFLARE_API_BASE}/api/repos/${encodeURIComponent(name)}`,
      {
        headers: this.getHeaders(),
      },
    );
    if (!response.ok) {
      throw new Error(
        `Failed to fetch GitFlare repo "${name}": ${response.status}`,
      );
    }
    return response.json();
  }

  /**
   * Get the git clone URL for a GitFlare repository.
   */
  static getCloneUrl(repoName: string): string {
    return `${GITFLARE_API_BASE}/git/${repoName}`;
  }
}

export default GitFlareService;

const GITFLARE_API_BASE = "https://git.beenex.company";

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
   * List all GitFlare repositories.
   */
  static async listRepos(
    limit = 50,
    offset = 0,
  ): Promise<GitFlareRepoListResponse> {
    const url = new URL(`${GITFLARE_API_BASE}/api/repos`);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));

    const response = await fetch(url.toString());
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

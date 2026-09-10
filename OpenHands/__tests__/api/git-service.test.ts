import { describe, expect, vi, beforeEach, it, afterEach } from "vitest";
import GitService from "#/api/git-service/git-service.api";
import * as cloudGitService from "#/api/cloud/git-service.api";
import * as activeStore from "#/api/backend-registry/active-store";
import GitHubOAuthService from "#/api/github-oauth-service";

vi.mock("#/api/cloud/git-service.api", () => ({
  searchCloudRepositories: vi.fn(),
  getCloudInstallations: vi.fn(),
  getCloudRepositoryBranches: vi.fn(),
}));

vi.mock("#/api/github-oauth-service", () => ({
  default: {
    listRepos: vi.fn(),
    listBranches: vi.fn(),
  },
}));

vi.mock("#/api/backend-registry/active-store", () => ({
  getActiveBackend: vi.fn(),
}));

const mockSearchCloudRepositories = vi.mocked(
  cloudGitService.searchCloudRepositories,
);
const mockGetCloudInstallations = vi.mocked(
  cloudGitService.getCloudInstallations,
);
const mockGetCloudRepositoryBranches = vi.mocked(
  cloudGitService.getCloudRepositoryBranches,
);
const mockListLocalGithubRepos = vi.mocked(GitHubOAuthService.listRepos);
const mockListLocalGithubBranches = vi.mocked(GitHubOAuthService.listBranches);
const mockGetActiveBackend = vi.mocked(activeStore.getActiveBackend);

const cloudActive = () =>
  mockGetActiveBackend.mockReturnValue({
    backend: {
      kind: "cloud",
      id: "test",
      name: "Test",
      host: "https://example.com",
      apiKey: "test-key",
    },
    orgId: "org-1",
  });

const localActive = () =>
  mockGetActiveBackend.mockReturnValue({
    backend: {
      kind: "local",
      id: "test",
      name: "Test",
      host: "http://localhost",
      apiKey: "test-key",
    },
    orgId: null,
  });

describe("GitService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("invalid provider guards", () => {
    const invalidProviders = [
      { value: null, name: "null" },
      { value: undefined, name: "undefined" },
      { value: "", name: "empty string" },
      { value: "undefined", name: '"undefined" string' },
      { value: "null", name: '"null" string' },
    ];

    describe("searchGitRepositories", () => {
      it.each(invalidProviders)(
        "should return empty results when provider is $name (cloud mode)",
        async ({ value }) => {
          cloudActive();

          const result = await GitService.searchGitRepositories(
            "test query",
            value as string,
          );

          expect(result).toEqual({ items: [], next_page_id: null });
          expect(mockSearchCloudRepositories).not.toHaveBeenCalled();
        },
      );
    });

    describe("retrieveUserGitRepositories", () => {
      it.each(invalidProviders)(
        "should return empty results when provider is $name",
        async ({ value }) => {
          cloudActive();

          const result = await GitService.retrieveUserGitRepositories(
            value as string,
          );

          expect(result).toEqual({ items: [], next_page_id: null });
          expect(mockSearchCloudRepositories).not.toHaveBeenCalled();
        },
      );
    });

    describe("retrieveInstallationRepositories", () => {
      it.each(invalidProviders)(
        "should return empty results when provider is $name",
        async ({ value }) => {
          cloudActive();

          const result = await GitService.retrieveInstallationRepositories(
            value as string,
            0,
            ["installation-1"],
          );

          expect(result).toEqual({ items: [], next_page_id: null });
          expect(mockSearchCloudRepositories).not.toHaveBeenCalled();
        },
      );
    });

    describe("getUserInstallations", () => {
      it.each(invalidProviders)(
        "should return empty results when provider is $name",
        async ({ value }) => {
          cloudActive();

          const result = await GitService.getUserInstallations(value as string);

          expect(result).toEqual({ items: [], next_page_id: null });
          expect(mockGetCloudInstallations).not.toHaveBeenCalled();
        },
      );
    });

    describe("getRepositoryBranches", () => {
      it.each(invalidProviders)(
        "should return empty results when provider is $name",
        async ({ value }) => {
          cloudActive();

          const result = await GitService.getRepositoryBranches(
            "owner/repo",
            value as string,
          );

          expect(result).toEqual({ items: [], next_page_id: null });
          expect(mockGetCloudRepositoryBranches).not.toHaveBeenCalled();
        },
      );
    });

    describe("searchRepositoryBranches", () => {
      it.each(invalidProviders)(
        "should return empty results when provider is $name",
        async ({ value }) => {
          cloudActive();

          const result = await GitService.searchRepositoryBranches(
            "owner/repo",
            value as string,
            "main",
          );

          expect(result).toEqual({ items: [], next_page_id: null });
          expect(mockGetCloudRepositoryBranches).not.toHaveBeenCalled();
        },
      );
    });
  });

  describe("valid provider behavior", () => {
    it("should call cloud API when provider is valid and cloud is active", async () => {
      cloudActive();
      mockSearchCloudRepositories.mockResolvedValue({
        items: [
          {
            id: "1",
            full_name: "owner/repo",
            git_provider: "github",
            is_public: true,
          },
        ],
        next_page_id: null,
      });

      const result = await GitService.searchGitRepositories("test", "github");

      expect(mockSearchCloudRepositories).toHaveBeenCalledWith({
        provider: "github",
        query: "test",
        limit: 100,
        pageId: undefined,
        installationId: undefined,
      });
      expect(result.items).toHaveLength(1);
    });

    it("should list local GitHub repos through the OAuth service", async () => {
      localActive();
      mockListLocalGithubRepos.mockResolvedValue({
        items: [
          {
            id: "1",
            full_name: "BillulloNex/Starship",
            git_provider: "github",
            is_public: false,
          },
        ],
        next_page_id: null,
      });

      const result = await GitService.searchGitRepositories(
        "Starship",
        "github",
      );

      expect(mockSearchCloudRepositories).not.toHaveBeenCalled();
      expect(mockListLocalGithubRepos).toHaveBeenCalledWith({
        query: "Starship",
        limit: 100,
        pageId: undefined,
      });
      expect(result.items).toHaveLength(1);
    });

    it("should list local GitHub branches through the OAuth service", async () => {
      localActive();
      mockListLocalGithubBranches.mockResolvedValue({
        items: [{ name: "main", commit_sha: "abc", protected: false }],
        next_page_id: null,
      });

      const result = await GitService.getRepositoryBranches(
        "BillulloNex/Starship",
        "github",
      );

      expect(mockGetCloudRepositoryBranches).not.toHaveBeenCalled();
      expect(mockListLocalGithubBranches).toHaveBeenCalledWith(
        "BillulloNex/Starship",
        { query: undefined, limit: 30, pageId: undefined },
      );
      expect(result.items[0]?.name).toBe("main");
    });
  });
});

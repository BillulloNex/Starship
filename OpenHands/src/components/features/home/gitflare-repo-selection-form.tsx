import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "#/utils/utils";
import { formControlFieldClassName } from "#/utils/form-control-classes";
import { I18nKey } from "#/i18n/declaration";
import { BrandButton } from "../settings/brand-button";
import RepoIcon from "#/icons/repo.svg?react";
import GitFlareService, {
  type GitFlareRepo,
} from "#/api/gitflare-service";

interface GitFlareRepoSelectionFormProps {
  onConfirm: (selection: {
    repoName: string;
    cloneUrl: string;
    defaultBranch: string;
  }) => void;
}

export function GitFlareRepoSelectionForm({
  onConfirm,
}: GitFlareRepoSelectionFormProps) {
  const { t } = useTranslation("openhands");
  const [repos, setRepos] = useState<GitFlareRepo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<GitFlareRepo | null>(null);
  const [filterText, setFilterText] = useState("");
  const [showKeyConfig, setShowKeyConfig] = useState(false);
  const [customApiKey, setCustomApiKey] = useState("");

  const fetchRepos = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await GitFlareService.listRepos();
      setRepos(data.repos || []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t(I18nKey.COMMON$GITFLARE_ERROR_LOADING),
      );
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void fetchRepos();
  }, [fetchRepos]);

  const handleSaveApiKey = () => {
    if (customApiKey.trim()) {
      GitFlareService.setApiKey(customApiKey.trim());
      setShowKeyConfig(false);
      void fetchRepos();
    }
  };

  const filteredRepos = repos.filter(
    (repo) =>
      repo.name.toLowerCase().includes(filterText.toLowerCase()) ||
      (repo.description &&
        repo.description.toLowerCase().includes(filterText.toLowerCase())),
  );

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-[10px] pb-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-white font-normal leading-[22px]">
            {t(I18nKey.COMMON$GITFLARE_SELECT_REPO)}
          </span>
          <button
            type="button"
            onClick={() => setShowKeyConfig((prev) => !prev)}
            className="text-xs text-[var(--oh-muted)] hover:text-white underline cursor-pointer"
          >
            {showKeyConfig ? "Hide API Key" : "Config API Key"}
          </button>
        </div>

        {/* API Key Override Input */}
        {showKeyConfig && (
          <div className="flex flex-col gap-1.5 p-2.5 rounded border border-[var(--oh-border)] bg-[var(--oh-surface)]">
            <span className="text-xs text-[var(--oh-muted)]">
              GitFlare API Key (saved in browser):
            </span>
            <div className="flex gap-2">
              <input
                type="password"
                value={customApiKey}
                onChange={(e) => setCustomApiKey(e.target.value)}
                placeholder="gf_..."
                className={cn(
                  formControlFieldClassName,
                  "text-inherit shadow-none px-2 py-1 text-xs flex-1",
                )}
              />
              <button
                type="button"
                onClick={handleSaveApiKey}
                className="px-2.5 py-1 text-xs font-medium rounded bg-white text-black hover:bg-neutral-200 cursor-pointer"
              >
                Save
              </button>
            </div>
          </div>
        )}

        {/* Search/filter input */}
        <div className="group relative text-[var(--oh-muted)] hover:text-white">
          <div className="absolute left-2 top-1/2 transform -translate-y-1/2 z-10">
            {isLoading ? (
              <div className="animate-spin h-4 w-4 border-2 border-transparent border-t-white rounded-full" />
            ) : (
              <RepoIcon width={16} height={16} />
            )}
          </div>
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder={t(I18nKey.COMMON$GITFLARE_SELECT_REPO)}
            className={cn(
              formControlFieldClassName,
              "text-inherit shadow-none pl-7 pr-4 text-sm font-normal leading-5",
              "placeholder:text-[var(--oh-muted)]",
            )}
            data-testid="gitflare-repo-filter"
          />
        </div>

        {/* Error state */}
        {error && (
          <div className="flex flex-col gap-1">
            <div className="text-sm text-red-400 px-1">{error}</div>
            <button
              type="button"
              onClick={() => void fetchRepos()}
              className="text-xs text-left text-blue-400 hover:underline px-1 cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="text-sm text-[var(--oh-muted)] px-1">
            {t(I18nKey.COMMON$GITFLARE_LOADING_REPOS)}
          </div>
        )}

        {/* Repo list */}
        {!isLoading && !error && (
          <div className="max-h-[240px] overflow-y-auto rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface)]">
            {filteredRepos.length === 0 ? (
              <div className="px-3 py-4 text-sm text-[var(--oh-muted)] text-center">
                {t(I18nKey.COMMON$GITFLARE_NO_REPOS)}
              </div>
            ) : (
              filteredRepos.map((repo) => (
                <button
                  key={repo.id}
                  type="button"
                  onClick={() => setSelectedRepo(repo)}
                  className={cn(
                    "flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition-colors",
                    "hover:bg-surface-raised cursor-pointer",
                    selectedRepo?.id === repo.id
                      ? "bg-surface-raised text-white"
                      : "text-[var(--oh-muted)]",
                  )}
                  data-testid={`gitflare-repo-item-${repo.name}`}
                >
                  <RepoIcon
                    width={14}
                    height={14}
                    className="mt-0.5 shrink-0"
                  />
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium text-white truncate">
                      {repo.name}
                    </span>
                    {repo.description && (
                      <span className="text-xs text-[var(--oh-muted)] truncate">
                        {repo.description}
                      </span>
                    )}
                    <span className="text-xs text-[var(--oh-muted)]">
                      {/* eslint-disable-next-line i18next/no-literal-string -- branch label */}
                      {repo.default_branch} · {repo.is_private ? "Private" : "Public"}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <BrandButton
        testId="gitflare-repo-confirm-button"
        variant="primary"
        type="button"
        isDisabled={!selectedRepo}
        onClick={() => {
          if (!selectedRepo) return;
          onConfirm({
            repoName: selectedRepo.name,
            cloneUrl: GitFlareService.getCloneUrl(selectedRepo.name),
            defaultBranch: selectedRepo.default_branch,
          });
        }}
        className="w-full"
      >
        {t(I18nKey.BUTTON$CONFIRM)}
      </BrandButton>
    </div>
  );
}

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";

import { I18nKey } from "#/i18n/declaration";
import { useHasAttachedSource } from "#/hooks/use-has-attached-source";
import { useHasGitCommits } from "#/hooks/query/use-has-git-commits";
import { useAutoRefreshFilesOnEdit } from "#/hooks/use-auto-refresh-files-on-edit";
import { useUnifiedGetGitChanges } from "#/hooks/query/use-unified-get-git-changes";
import { useOptionalConversationId } from "#/hooks/use-conversation-id";
import { useConversationLocalStorageState } from "#/utils/conversation-local-storage";
import { WorkspaceFileBrowser } from "#/components/features/files-tab/workspace-file-browser";
import { SegmentedToggle } from "#/components/features/files-tab/segmented-toggle";
import type { ViewMode } from "#/components/features/files-tab/view-mode";
import RefreshIcon from "#/icons/u-refresh.svg?react";
import LinkExternalIcon from "#/icons/link-external.svg?react";
import { useUnifiedGitCommits } from "#/hooks/query/use-unified-git-commits";
import { useSelectedWorkspaceFile } from "#/hooks/use-selected-workspace-file";
import { useWorkspaceFileContent } from "#/hooks/query/use-workspace-file-content";
import {
  useWorkspaceMutationCounter,
  withWorkspaceCacheBuster,
} from "#/stores/use-workspace-mutation-counter";
import GitChanges from "./changes-tab";
import GitCommits from "./commits-tab";

function FilesTab() {
  const { t } = useTranslation("openhands");

  useAutoRefreshFilesOnEdit();

  const { hasAttachedSource, isLoading: isAttachedSourceLoading } =
    useHasAttachedSource();
  const { hasCommits } = useHasGitCommits({ enabled: hasAttachedSource });

  const { conversationId } = useOptionalConversationId();
  const {
    state: persistedState,
    setFilesTabDiffView,
    setFilesTabContentViewMode,
  } = useConversationLocalStorageState(conversationId ?? "");

  const diffViewDefault =
    (hasAttachedSource || isAttachedSourceLoading) && hasCommits !== false;
  const diffViewEnabled = persistedState.filesTabDiffView ?? diffViewDefault;
  const contentViewMode = persistedState.filesTabContentViewMode;

  const { isSuccess: commitsIsSuccess, isUnsupported: commitsUnsupported } =
    useUnifiedGitCommits();
  const showCommitsOption = commitsIsSuccess && !commitsUnsupported;
  const [commitsViewSelected, setCommitsViewSelected] = useState(false);
  let activeView: "on" | "off" | "commits" = diffViewEnabled ? "on" : "off";
  if (commitsViewSelected && showCommitsOption) activeView = "commits";

  const selectedPath = useSelectedWorkspaceFile();
  const selectedFileContent = useWorkspaceFileContent(selectedPath);
  const mutationCounter = useWorkspaceMutationCounter((state) => state.count);
  const selectedFileStaticUrl = withWorkspaceCacheBuster(
    selectedFileContent.data?.staticUrl ?? null,
    mutationCounter,
  );

  const queryClient = useQueryClient();
  const { refetch: refetchGitChanges, isFetching: isFetchingGitChanges } =
    useUnifiedGetGitChanges();
  const refreshFiles = () => {
    refetchGitChanges();
    queryClient.invalidateQueries({ queryKey: ["workspace-files"] });
    queryClient.invalidateQueries({ queryKey: ["workspace-file-content"] });
    queryClient.invalidateQueries({ queryKey: ["git_commits"] });
  };

  return (
    <main
      className="h-full w-full flex flex-col items-stretch bg-[var(--oh-surface)]"
      data-testid="files-tab"
    >
      <div className="flex items-center gap-3 px-3 py-1.5 border-b border-[var(--oh-border)] shrink-0">
        <SegmentedToggle<"on" | "off" | "commits">
          ariaLabel={t(I18nKey.FILES$DIFF_VIEW)}
          testId="files-tab-diff-toggle"
          value={activeView}
          options={[
            { value: "on", label: t(I18nKey.FILES$DIFF_VIEW) },
            ...(showCommitsOption
              ? [
                  {
                    value: "commits" as const,
                    label: t(I18nKey.DIFF_VIEWER$COMMITS),
                  },
                ]
              : []),
            { value: "off", label: t(I18nKey.COMMON$FILES) },
          ]}
          onChange={(value) => {
            if (value === "commits") {
              setCommitsViewSelected(true);
            } else {
              setCommitsViewSelected(false);
              setFilesTabDiffView(value === "on");
            }
          }}
        />

        {activeView === "off" && (
          <SegmentedToggle<ViewMode>
            ariaLabel={t(I18nKey.FILES$RICH)}
            testId="files-tab-content-mode-toggle"
            value={contentViewMode}
            options={[
              { value: "rich", label: t(I18nKey.FILES$RICH) },
              { value: "plain", label: t(I18nKey.FILES$PLAIN) },
              { value: "edit", label: "Edit" },
            ]}
            onChange={setFilesTabContentViewMode}
          />
        )}

        <div className="ml-auto flex items-center gap-1">
          {activeView === "off" && selectedFileStaticUrl && (
            <a
              href={selectedFileStaticUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t(I18nKey.FILES$OPEN_IN_NEW_WINDOW)}
              title={t(I18nKey.FILES$OPEN_IN_NEW_WINDOW)}
              data-testid="files-tab-open-in-new-window"
              className="flex items-center justify-center w-[26px] py-1 rounded-[7px] hover:bg-[var(--oh-interactive-hover)] cursor-pointer text-white"
            >
              <LinkExternalIcon width={14} height={14} />
            </a>
          )}
          <button
            type="button"
            onClick={refreshFiles}
            disabled={isFetchingGitChanges}
            aria-label={t(I18nKey.FILES$REFRESH)}
            title={t(I18nKey.FILES$REFRESH)}
            data-testid="files-tab-refresh"
            className="flex items-center justify-center w-[26px] py-1 rounded-[7px] hover:enabled:bg-[var(--oh-interactive-hover)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshIcon
              width={12.75}
              height={15}
              color="#ffffff"
              className={isFetchingGitChanges ? "animate-spin" : ""}
            />
          </button>
        </div>
      </div>

      {activeView === "on" && (
        <div className="flex-1 min-h-0">
          <GitChanges />
        </div>
      )}
      {activeView === "commits" && (
        <div className="flex-1 min-h-0">
          <GitCommits />
        </div>
      )}
      {activeView === "off" && (
        <div className="flex flex-1 flex-col min-h-0">
          <WorkspaceFileBrowser
            viewMode={contentViewMode}
            onEditFile={() => setFilesTabContentViewMode("edit")}
            onRefresh={refreshFiles}
            isRefreshing={isFetchingGitChanges}
          />
        </div>
      )}
    </main>
  );
}

export default FilesTab;

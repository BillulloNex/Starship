import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";

import { NoFileSelectedMessage } from "#/components/features/files-tab/no-file-selected-message";
import { I18nKey } from "#/i18n/declaration";
import { useFilesTabStore } from "#/stores/files-tab-store";
import { useWorkspaceFiles } from "#/hooks/query/use-workspace-files";
import { useWorkspaceFileContent } from "#/hooks/query/use-workspace-file-content";
import { useHasAttachedSource } from "#/hooks/use-has-attached-source";
import { useHasGitCommits } from "#/hooks/query/use-has-git-commits";
import { useAutoRefreshFilesOnEdit } from "#/hooks/use-auto-refresh-files-on-edit";
import { useUnifiedGetGitChanges } from "#/hooks/query/use-unified-get-git-changes";
import { useOptionalConversationId } from "#/hooks/use-conversation-id";
import { useConversationLocalStorageState } from "#/utils/conversation-local-storage";
import {
  useWorkspaceMutationCounter,
  withWorkspaceCacheBuster,
} from "#/stores/use-workspace-mutation-counter";
import { sortFilesByPriority } from "#/utils/file-priority";
import { FileQuickRow } from "#/components/features/files-tab/file-quick-row";
import { FileTreeView } from "#/components/features/files-tab/file-tree-view";
import { FileContentViewer } from "#/components/features/files-tab/file-content-viewer";
import { SegmentedToggle } from "#/components/features/files-tab/segmented-toggle";
import { EditorTabBar } from "#/components/features/files-tab/editor-tab-bar";
import { EditorBreadcrumbs } from "#/components/features/files-tab/editor-breadcrumbs";
import { EditorStatusBar } from "#/components/features/files-tab/editor-status-bar";
import { ResizableSplitter } from "#/components/features/files-tab/resizable-splitter";
import { QuickFileSearchModal } from "#/components/features/files-tab/quick-file-search-modal";
import type { ViewMode } from "#/components/features/files-tab/view-mode";
import RefreshIcon from "#/icons/u-refresh.svg?react";
import LinkExternalIcon from "#/icons/link-external.svg?react";
import { useUnifiedGitCommits } from "#/hooks/query/use-unified-git-commits";
import GitChanges from "./changes-tab";
import GitCommits from "./commits-tab";

function FilesTab() {
  const { t } = useTranslation("openhands");

  // Keep the list / content / diff caches fresh as the agent writes files.
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

  // Sidebar tree visibility
  const [isTreeVisible, setIsTreeVisible] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

  const filesQuery = useWorkspaceFiles();
  const paths = useMemo(() => filesQuery.data ?? [], [filesQuery.data]);

  const storedSelectedPath = useFilesTabStore((s) => s.selectedPath);
  const selectedConversationId = useFilesTabStore(
    (s) => s.selectedConversationId,
  );
  const setSelectedPath = useFilesTabStore((s) => s.setSelectedPath);
  const sidebarWidth = useFilesTabStore((s) => s.sidebarWidth);
  const setSidebarWidth = useFilesTabStore((s) => s.setSidebarWidth);
  const isSidebarCollapsed = useFilesTabStore((s) => s.isSidebarCollapsed);
  const setSidebarCollapsed = useFilesTabStore((s) => s.setSidebarCollapsed);
  const closeTab = useFilesTabStore((s) => s.closeTab);

  // A selection is scoped to the conversation it was made in.
  const selectedPath =
    selectedConversationId === conversationId ? storedSelectedPath : null;

  const handleSelectFile = useCallback(
    (path: string) => setSelectedPath(path, conversationId),
    [conversationId, setSelectedPath],
  );

  const selectedFileContent = useWorkspaceFileContent(selectedPath);
  const mutationCounter = useWorkspaceMutationCounter((state) => state.count);
  const selectedFileStaticUrl = withWorkspaceCacheBuster(
    selectedFileContent.data?.staticUrl ?? null,
    mutationCounter,
  );

  // Sync isTreeVisible with store
  useEffect(() => {
    setIsTreeVisible(!isSidebarCollapsed);
  }, [isSidebarCollapsed]);

  useEffect(() => {
    if (selectedConversationId === conversationId) return;
    setSelectedPath(null, conversationId);
  }, [selectedConversationId, conversationId, setSelectedPath]);

  // Auto-select the highest-priority file on initial mount
  useEffect(() => {
    if (selectedPath || paths.length === 0) return;
    const regularFiles = paths.filter((p) => !p.endsWith("/"));
    const [first] = sortFilesByPriority(regularFiles);
    if (first) setSelectedPath(first, conversationId);
  }, [paths, selectedPath, conversationId, setSelectedPath]);

  // Keyboard shortcut listener for Cmd+P (Search) and Cmd+W (Close tab)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Cmd+P or Ctrl+P: Quick file open
      if ((e.metaKey || e.ctrlKey) && e.key === "p") {
        e.preventDefault();
        setIsSearchModalOpen((prev) => !prev);
      }
      // Cmd+W or Ctrl+W: Close active tab
      if ((e.metaKey || e.ctrlKey) && e.key === "w" && selectedPath) {
        // Prevent browser from closing window if focused within files tab
        e.preventDefault();
        closeTab(selectedPath);
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [selectedPath, closeTab]);

  const queryClient = useQueryClient();
  const { refetch: refetchGitChanges, isFetching: isFetchingGitChanges } =
    useUnifiedGetGitChanges();
  const refreshFiles = () => {
    refetchGitChanges();
    queryClient.invalidateQueries({ queryKey: ["workspace-files"] });
    queryClient.invalidateQueries({ queryKey: ["workspace-file-content"] });
    queryClient.invalidateQueries({ queryKey: ["git_commits"] });
  };

  const handleSidebarResize = useCallback(
    (clientX: number) => {
      setSidebarWidth(clientX);
    },
    [setSidebarWidth],
  );

  return (
    <main
      className="h-full w-full flex flex-col items-stretch bg-[var(--oh-surface)]"
      data-testid="files-tab"
    >
      {/* Top toolbar: diff/files + rich/plain/edit toggles plus refresh */}
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
          {filesQuery.isLoading ? (
            <div className="flex flex-1 items-center justify-center text-sm text-[var(--oh-muted)]">
              {t(I18nKey.FILES$LOADING_FILES)}
            </div>
          ) : (
            <>
              <FileQuickRow
                paths={paths}
                selectedPath={selectedPath}
                onSelectFile={handleSelectFile}
                isTreeVisible={isTreeVisible}
                onToggleTree={() => {
                  const nextState = !isTreeVisible;
                  setIsTreeVisible(nextState);
                  setSidebarCollapsed(!nextState);
                }}
              />
              <div className="flex h-full min-h-0 flex-1 relative">
                {/* File Explorer Sidebar */}
                {isTreeVisible && (
                  <>
                    <aside
                      style={{ width: `${sidebarWidth}px` }}
                      className="shrink-0 border-r border-[var(--oh-border)] overflow-hidden flex flex-col"
                      data-testid="files-tab-tree"
                    >
                      <FileTreeView
                        paths={paths}
                        selectedPath={selectedPath}
                        onSelectFile={handleSelectFile}
                        onEditFile={(path) => {
                          handleSelectFile(path);
                          setFilesTabContentViewMode("edit");
                        }}
                      />
                    </aside>
                    <ResizableSplitter
                      onResize={handleSidebarResize}
                      onReset={() => setSidebarWidth(260)}
                    />
                  </>
                )}

                {/* Main IDE Editor / Viewer Area */}
                <section
                  className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-[#141414]"
                  data-testid="files-tab-content"
                >
                  <EditorTabBar
                    onOpenSearchModal={() => setIsSearchModalOpen(true)}
                    onRefresh={refreshFiles}
                    isRefreshing={isFetchingGitChanges}
                  />

                  {selectedPath ? (
                    <>
                      <EditorBreadcrumbs
                        path={selectedPath}
                        onSelectPath={handleSelectFile}
                      />
                      <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
                        <FileContentViewer
                          path={selectedPath}
                          viewMode={contentViewMode}
                        />
                      </div>
                      <EditorStatusBar path={selectedPath} />
                    </>
                  ) : (
                    <NoFileSelectedMessage />
                  )}
                </section>
              </div>
            </>
          )}
        </div>
      )}

      {/* Quick Search Modal */}
      <QuickFileSearchModal
        isOpen={isSearchModalOpen}
        paths={paths}
        onClose={() => setIsSearchModalOpen(false)}
        onSelectFile={handleSelectFile}
      />
    </main>
  );
}

export default FilesTab;

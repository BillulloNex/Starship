import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";

import { NoFileSelectedMessage } from "#/components/features/files-tab/no-file-selected-message";
import { I18nKey } from "#/i18n/declaration";
import { useFilesTabStore } from "#/stores/files-tab-store";
import { useWorkspaceFiles } from "#/hooks/query/use-workspace-files";
import { useSelectedWorkspaceFile } from "#/hooks/use-selected-workspace-file";
import { useWorkspaceRuntime } from "#/context/workspace-runtime-context";
import {
  useWorkspaceMutationCounter,
  withWorkspaceCacheBuster,
} from "#/stores/use-workspace-mutation-counter";
import { sortFilesByPriority } from "#/utils/file-priority";
import { FileQuickRow } from "#/components/features/files-tab/file-quick-row";
import { FileTreeView } from "#/components/features/files-tab/file-tree-view";
import { FileContentViewer } from "#/components/features/files-tab/file-content-viewer";
import { EditorTabBar } from "#/components/features/files-tab/editor-tab-bar";
import { EditorBreadcrumbs } from "#/components/features/files-tab/editor-breadcrumbs";
import { EditorStatusBar } from "#/components/features/files-tab/editor-status-bar";
import { ResizableSplitter } from "#/components/features/files-tab/resizable-splitter";
import { QuickFileSearchModal } from "#/components/features/files-tab/quick-file-search-modal";
import type { ViewMode } from "#/components/features/files-tab/view-mode";
import { useWorkspaceFileContent } from "#/hooks/query/use-workspace-file-content";

interface WorkspaceFileBrowserProps {
  viewMode: ViewMode;
  onEditFile?: (path: string) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function WorkspaceFileBrowser({
  viewMode,
  onEditFile,
  onRefresh,
  isRefreshing = false,
}: WorkspaceFileBrowserProps) {
  const { t } = useTranslation("openhands");
  const queryClient = useQueryClient();
  const { workspaceKey } = useWorkspaceRuntime();

  const filesQuery = useWorkspaceFiles();
  const paths = useMemo(() => filesQuery.data ?? [], [filesQuery.data]);

  const selectedPath = useSelectedWorkspaceFile();
  const selectedConversationId = useFilesTabStore(
    (s) => s.selectedConversationId,
  );
  const setSelectedPath = useFilesTabStore((s) => s.setSelectedPath);
  const sidebarWidth = useFilesTabStore((s) => s.sidebarWidth);
  const setSidebarWidth = useFilesTabStore((s) => s.setSidebarWidth);
  const isSidebarCollapsed = useFilesTabStore((s) => s.isSidebarCollapsed);
  const setSidebarCollapsed = useFilesTabStore((s) => s.setSidebarCollapsed);
  const closeTab = useFilesTabStore((s) => s.closeTab);

  const [isTreeVisible, setIsTreeVisible] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

  const handleSelectFile = useCallback(
    (path: string) => setSelectedPath(path, workspaceKey),
    [workspaceKey, setSelectedPath],
  );

  const selectedFileContent = useWorkspaceFileContent(selectedPath);
  const mutationCounter = useWorkspaceMutationCounter((state) => state.count);
  const selectedFileStaticUrl = withWorkspaceCacheBuster(
    selectedFileContent.data?.staticUrl ?? null,
    mutationCounter,
  );

  useEffect(() => {
    setIsTreeVisible(!isSidebarCollapsed);
  }, [isSidebarCollapsed]);

  useEffect(() => {
    if (selectedConversationId === workspaceKey) return;
    setSelectedPath(null, workspaceKey);
  }, [selectedConversationId, workspaceKey, setSelectedPath]);

  useEffect(() => {
    if (selectedPath || paths.length === 0) return;
    const regularFiles = paths.filter((p) => !p.endsWith("/"));
    const [first] = sortFilesByPriority(regularFiles);
    if (first) setSelectedPath(first, workspaceKey);
  }, [paths, selectedPath, workspaceKey, setSelectedPath]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "p") {
        e.preventDefault();
        setIsSearchModalOpen((prev) => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "w" && selectedPath) {
        e.preventDefault();
        closeTab(selectedPath);
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [selectedPath, closeTab]);

  const refreshFiles = useCallback(() => {
    onRefresh?.();
    queryClient.invalidateQueries({ queryKey: ["workspace-files"] });
    queryClient.invalidateQueries({ queryKey: ["workspace-file-content"] });
  }, [onRefresh, queryClient]);

  const handleSidebarResize = useCallback(
    (clientX: number) => {
      setSidebarWidth(clientX);
    },
    [setSidebarWidth],
  );

  if (filesQuery.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-[var(--oh-muted)]">
        {t(I18nKey.FILES$LOADING_FILES)}
      </div>
    );
  }

  return (
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
                  onEditFile?.(path);
                }}
              />
            </aside>
            <ResizableSplitter
              onResize={handleSidebarResize}
              onReset={() => setSidebarWidth(260)}
            />
          </>
        )}

        <section
          className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-[#141414]"
          data-testid="files-tab-content"
        >
          <EditorTabBar
            onOpenSearchModal={() => setIsSearchModalOpen(true)}
            onRefresh={refreshFiles}
            isRefreshing={isRefreshing}
          />

          {selectedPath ? (
            <>
              <EditorBreadcrumbs
                path={selectedPath}
                onSelectPath={handleSelectFile}
              />
              <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
                <FileContentViewer path={selectedPath} viewMode={viewMode} />
              </div>
              <EditorStatusBar path={selectedPath} />
            </>
          ) : (
            <NoFileSelectedMessage />
          )}
        </section>
      </div>

      <QuickFileSearchModal
        isOpen={isSearchModalOpen}
        paths={paths}
        onClose={() => setIsSearchModalOpen(false)}
        onSelectFile={handleSelectFile}
      />

      {selectedFileStaticUrl ? (
        <span className="hidden" data-testid="files-selected-static-url">
          {selectedFileStaticUrl}
        </span>
      ) : null}
    </>
  );
}

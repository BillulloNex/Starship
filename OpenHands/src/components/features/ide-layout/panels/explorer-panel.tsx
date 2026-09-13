/* eslint-disable i18next/no-literal-string */
import { useCallback } from "react";
import { useWorkspaceRuntime } from "#/context/workspace-runtime-context";
import { useWorkspaceFiles } from "#/hooks/query/use-workspace-files";
import { useSelectedWorkspaceFile } from "#/hooks/use-selected-workspace-file";
import { useFilesTabStore } from "#/stores/files-tab-store";
import { FileTreeView } from "#/components/features/files-tab/file-tree-view";

export function ExplorerPanel() {
  const { workspaceKey } = useWorkspaceRuntime();
  const filesQuery = useWorkspaceFiles();
  const selectedPath = useSelectedWorkspaceFile();
  const setSelectedPath = useFilesTabStore((s) => s.setSelectedPath);

  const handleSelectFile = useCallback(
    (path: string) => setSelectedPath(path || null, workspaceKey),
    [setSelectedPath, workspaceKey],
  );

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden bg-[var(--oh-surface)]"
      data-testid="ide-explorer-panel"
    >
      {filesQuery.isLoading ? (
        <div className="flex flex-1 items-center justify-center text-xs text-[var(--oh-muted)]">
          Loading files…
        </div>
      ) : (
        <FileTreeView
          paths={filesQuery.data ?? []}
          selectedPath={selectedPath}
          onSelectFile={handleSelectFile}
        />
      )}
    </div>
  );
}

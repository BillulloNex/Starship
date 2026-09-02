/* eslint-disable i18next/no-literal-string */
import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FilePlus, FolderPlus, Search, X, ChevronsUpDown } from "lucide-react";

import { I18nKey } from "#/i18n/declaration";
import { buildFileTree, filterFileTree } from "#/utils/file-tree";
import { TreeNode } from "./tree-node";
import { FileContextMenu } from "./file-context-menu";
import {
  CreateEntryModal,
  RenameEntryModal,
  DeleteEntryModal,
} from "./file-explorer-modals";
import {
  useCreateWorkspaceFile,
  useCreateWorkspaceFolder,
  useDeleteWorkspacePath,
  useRenameWorkspacePath,
  useDuplicateWorkspacePath,
} from "#/hooks/mutation/use-workspace-file-mutations";

interface FileTreeViewProps {
  paths: string[];
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  onEditFile?: (path: string) => void;
  readOnly?: boolean;
}

export function FileTreeView({
  paths,
  selectedPath,
  onSelectFile,
  onEditFile,
  readOnly = false,
}: FileTreeViewProps) {
  const { t } = useTranslation("openhands");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedAll, setExpandedAll] = useState<boolean | undefined>(
    undefined,
  );

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    path: string;
    isDirectory: boolean;
  } | null>(null);

  // Modals state
  const [createModal, setCreateModal] = useState<{
    isOpen: boolean;
    type: "file" | "folder";
    parentPath: string | null;
  }>({
    isOpen: false,
    type: "file",
    parentPath: null,
  });

  const [renameModal, setRenameModal] = useState<{
    isOpen: boolean;
    path: string;
    isDirectory: boolean;
  }>({
    isOpen: false,
    path: "",
    isDirectory: false,
  });

  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    path: string;
    isDirectory: boolean;
  }>({
    isOpen: false,
    path: "",
    isDirectory: false,
  });

  // Mutations
  const createFileMutation = useCreateWorkspaceFile();
  const createFolderMutation = useCreateWorkspaceFolder();
  const deleteMutation = useDeleteWorkspacePath();
  const renameMutation = useRenameWorkspacePath();
  const duplicateMutation = useDuplicateWorkspacePath();

  const rawTree = useMemo(() => buildFileTree(paths), [paths]);
  const root = useMemo(() => {
    if (!searchQuery.trim()) return rawTree;
    return (
      filterFileTree(rawTree, searchQuery) ?? {
        name: "",
        path: "",
        isDirectory: true,
        children: [],
      }
    );
  }, [rawTree, searchQuery]);

  const handleCreateSubmit = async (path: string) => {
    if (createModal.type === "file") {
      await createFileMutation.mutateAsync({ path });
      onSelectFile(path);
      onEditFile?.(path);
    } else {
      await createFolderMutation.mutateAsync(path);
    }
  };

  const handleRenameSubmit = async (newPath: string) => {
    await renameMutation.mutateAsync({
      oldPath: renameModal.path,
      newPath,
    });
    if (selectedPath === renameModal.path) {
      onSelectFile(newPath);
    }
  };

  const handleDeleteConfirm = async () => {
    await deleteMutation.mutateAsync({
      path: deleteModal.path,
      isDirectory: deleteModal.isDirectory,
    });
    if (selectedPath === deleteModal.path) {
      onSelectFile("");
    }
  };

  const handleDuplicate = async (sourcePath: string) => {
    const parts = sourcePath.split(".");
    let targetPath = `${sourcePath}-copy`;
    if (parts.length > 1) {
      const ext = parts.pop();
      targetPath = `${parts.join(".")}-copy.${ext}`;
    }
    await duplicateMutation.mutateAsync({
      sourcePath,
      targetPath,
    });
    onSelectFile(targetPath);
  };

  const toggleExpandCollapse = () => {
    setExpandedAll((prev) => (prev ? false : true));
  };

  const handleBackgroundContextMenu = (e: React.MouseEvent) => {
    if (readOnly) return;
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      path: "",
      isDirectory: true,
    });
  };

  return (
    <div
      className="flex flex-col h-full w-full min-h-0 bg-[var(--oh-surface)]"
      onContextMenu={handleBackgroundContextMenu}
    >
      {/* Explorer Header */}
      {!readOnly && (
        <div className="flex flex-col border-b border-[var(--oh-border)] p-2 gap-2 shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--oh-muted)]">
              Explorer
            </span>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                title="New File"
                aria-label="New File"
                onClick={() =>
                  setCreateModal({
                    isOpen: true,
                    type: "file",
                    parentPath: null,
                  })
                }
                className="p-1 rounded text-[var(--oh-muted)] hover:text-white hover:bg-[var(--oh-surface-raised)] cursor-pointer"
              >
                <FilePlus className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                title="New Folder"
                aria-label="New Folder"
                onClick={() =>
                  setCreateModal({
                    isOpen: true,
                    type: "folder",
                    parentPath: null,
                  })
                }
                className="p-1 rounded text-[var(--oh-muted)] hover:text-white hover:bg-[var(--oh-surface-raised)] cursor-pointer"
              >
                <FolderPlus className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                title={expandedAll ? "Collapse All" : "Expand All"}
                aria-label={expandedAll ? "Collapse All" : "Expand All"}
                onClick={toggleExpandCollapse}
                className="p-1 rounded text-[var(--oh-muted)] hover:text-white hover:bg-[var(--oh-surface-raised)] cursor-pointer"
              >
                <ChevronsUpDown className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Search bar */}
          <div className="relative flex items-center">
            <Search className="absolute left-2 w-3 h-3 text-[var(--oh-muted)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search files..."
              className="w-full pl-7 pr-6 py-1 text-xs bg-[var(--oh-surface-raised)] border border-[var(--oh-border)] rounded text-white focus:outline-none focus:border-[var(--oh-interactive)]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-1.5 p-0.5 text-[var(--oh-muted)] hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Tree Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar-always min-h-0">
        {root.children.length === 0 ? (
          <div className="px-3 py-4 text-xs text-[var(--oh-muted)]">
            {searchQuery ? "No matching files" : t(I18nKey.FILES$NO_FILES)}
          </div>
        ) : (
          <ul className="py-1" data-testid="file-tree-view">
            {root.children.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                depth={0}
                selectedPath={selectedPath}
                expandedAll={expandedAll}
                onSelectFile={onSelectFile}
                onEditFile={onEditFile}
                onCreateFile={
                  readOnly
                    ? undefined
                    : (parentPath) =>
                        setCreateModal({
                          isOpen: true,
                          type: "file",
                          parentPath,
                        })
                }
                onCreateFolder={
                  readOnly
                    ? undefined
                    : (parentPath) =>
                        setCreateModal({
                          isOpen: true,
                          type: "folder",
                          parentPath,
                        })
                }
                onRename={
                  readOnly
                    ? undefined
                    : (path, isDirectory) =>
                        setRenameModal({
                          isOpen: true,
                          path,
                          isDirectory,
                        })
                }
                onDuplicate={readOnly ? undefined : handleDuplicate}
                onDelete={
                  readOnly
                    ? undefined
                    : (path, isDirectory) =>
                        setDeleteModal({
                          isOpen: true,
                          path,
                          isDirectory,
                        })
                }
                onContextMenu={(e, path, isDirectory) => {
                  if (readOnly) return;
                  setContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    path,
                    isDirectory,
                  });
                }}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <FileContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          path={contextMenu.path}
          isDirectory={contextMenu.isDirectory}
          onClose={() => setContextMenu(null)}
          onCreateFile={(parentPath) =>
            setCreateModal({
              isOpen: true,
              type: "file",
              parentPath,
            })
          }
          onCreateFolder={(parentPath) =>
            setCreateModal({
              isOpen: true,
              type: "folder",
              parentPath,
            })
          }
          onRename={(path, isDirectory) =>
            setRenameModal({
              isOpen: true,
              path,
              isDirectory,
            })
          }
          onDuplicate={handleDuplicate}
          onDelete={(path, isDirectory) =>
            setDeleteModal({
              isOpen: true,
              path,
              isDirectory,
            })
          }
        />
      )}

      {/* Modals */}
      <CreateEntryModal
        isOpen={createModal.isOpen}
        type={createModal.type}
        parentPath={createModal.parentPath}
        onClose={() => setCreateModal((prev) => ({ ...prev, isOpen: false }))}
        onSubmit={handleCreateSubmit}
        isPending={
          createFileMutation.isPending || createFolderMutation.isPending
        }
      />

      <RenameEntryModal
        isOpen={renameModal.isOpen}
        currentPath={renameModal.path}
        isDirectory={renameModal.isDirectory}
        onClose={() => setRenameModal((prev) => ({ ...prev, isOpen: false }))}
        onSubmit={handleRenameSubmit}
        isPending={renameMutation.isPending}
      />

      <DeleteEntryModal
        isOpen={deleteModal.isOpen}
        targetPath={deleteModal.path}
        isDirectory={deleteModal.isDirectory}
        onClose={() => setDeleteModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={handleDeleteConfirm}
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}

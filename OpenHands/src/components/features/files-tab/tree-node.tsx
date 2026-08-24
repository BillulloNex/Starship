/* eslint-disable i18next/no-literal-string */
import React, { useState } from "react";
import {
  FilePlus,
  FolderPlus,
  Pencil,
  Trash2,
  Copy,
  Folder,
  FolderOpen,
  FileCode,
} from "lucide-react";
import toast from "react-hot-toast";

import { FileTreeNode } from "#/utils/file-tree";
import { cn } from "#/utils/utils";

export interface TreeNodeActionCallbacks {
  onSelectFile: (path: string) => void;
  onEditFile?: (path: string) => void;
  onCreateFile?: (parentPath: string) => void;
  onCreateFolder?: (parentPath: string) => void;
  onRename?: (path: string, isDirectory: boolean) => void;
  onDelete?: (path: string, isDirectory: boolean) => void;
}

interface TreeNodeProps extends TreeNodeActionCallbacks {
  node: FileTreeNode;
  depth: number;
  selectedPath: string | null;
  expandedAll?: boolean;
}

export function TreeNode({
  node,
  depth,
  selectedPath,
  expandedAll,
  onSelectFile,
  onEditFile,
  onCreateFile,
  onCreateFolder,
  onRename,
  onDelete,
}: TreeNodeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const effectiveOpen = expandedAll !== undefined ? expandedAll : isOpen;
  const indentPx = 8 + depth * 12;

  const handleCopyPath = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(node.path);
    toast.success(`Copied path: ${node.path}`);
  };

  if (node.isDirectory) {
    return (
      <li className="group/tree-item">
        <div
          data-testid={`file-tree-dir-${node.path}`}
          className={cn(
            "flex w-full items-center justify-between py-1 pr-2 text-left text-xs text-white",
            "hover:bg-tertiary cursor-pointer group",
          )}
          style={{ paddingLeft: `${indentPx}px` }}
          onClick={() => setIsOpen((prev) => !prev)}
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <span
              aria-hidden
              className={cn(
                "inline-block w-3 text-[9px] text-[var(--oh-muted)] transition-transform shrink-0",
                effectiveOpen ? "rotate-90" : "rotate-0",
              )}
            >
              ▶
            </span>
            {effectiveOpen ? (
              <FolderOpen className="w-3.5 h-3.5 shrink-0 text-amber-400" />
            ) : (
              <Folder className="w-3.5 h-3.5 shrink-0 text-amber-400" />
            )}
            <span className="truncate font-medium">{node.name}</span>
          </div>

          {/* Hover actions for Directory */}
          <div
            className="hidden group-hover/tree-item:flex items-center gap-0.5 shrink-0 ml-1"
            onClick={(e) => e.stopPropagation()}
          >
            {onCreateFile && (
              <button
                type="button"
                title="New File inside folder"
                aria-label="New File inside folder"
                onClick={() => {
                  setIsOpen(true);
                  onCreateFile(node.path);
                }}
                className="p-1 rounded text-[var(--oh-muted)] hover:text-white hover:bg-[var(--oh-surface-raised)] cursor-pointer"
              >
                <FilePlus className="w-3 h-3" />
              </button>
            )}
            {onCreateFolder && (
              <button
                type="button"
                title="New Folder inside folder"
                aria-label="New Folder inside folder"
                onClick={() => {
                  setIsOpen(true);
                  onCreateFolder(node.path);
                }}
                className="p-1 rounded text-[var(--oh-muted)] hover:text-white hover:bg-[var(--oh-surface-raised)] cursor-pointer"
              >
                <FolderPlus className="w-3 h-3" />
              </button>
            )}
            {onRename && (
              <button
                type="button"
                title="Rename folder"
                aria-label="Rename folder"
                onClick={() => onRename(node.path, true)}
                className="p-1 rounded text-[var(--oh-muted)] hover:text-white hover:bg-[var(--oh-surface-raised)] cursor-pointer"
              >
                <Pencil className="w-3 h-3" />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                title="Delete folder"
                aria-label="Delete folder"
                onClick={() => onDelete(node.path, true)}
                className="p-1 rounded text-[var(--oh-muted)] hover:text-red-400 hover:bg-[var(--oh-surface-raised)] cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {effectiveOpen && node.children.length > 0 && (
          <ul>
            {node.children.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedPath={selectedPath}
                expandedAll={expandedAll}
                onSelectFile={onSelectFile}
                onEditFile={onEditFile}
                onCreateFile={onCreateFile}
                onCreateFolder={onCreateFolder}
                onRename={onRename}
                onDelete={onDelete}
              />
            ))}
          </ul>
        )}
      </li>
    );
  }

  const isSelected = selectedPath === node.path;
  return (
    <li className="group/tree-item">
      <div
        data-testid={`file-tree-file-${node.path}`}
        className={cn(
          "flex w-full items-center justify-between py-1 pr-2 text-left text-xs",
          "hover:bg-tertiary cursor-pointer group",
          isSelected
            ? "bg-[var(--oh-interactive-hover)] text-white"
            : "text-[var(--oh-text-tertiary)]",
        )}
        style={{ paddingLeft: `${indentPx + 14}px` }}
        onClick={() => onSelectFile(node.path)}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <FileCode className="w-3.5 h-3.5 shrink-0 text-blue-400" />
          <span className="truncate">{node.name}</span>
        </div>

        {/* Hover actions for File */}
        <div
          className="hidden group-hover/tree-item:flex items-center gap-0.5 shrink-0 ml-1"
          onClick={(e) => e.stopPropagation()}
        >
          {onEditFile && (
            <button
              type="button"
              title="Edit file"
              aria-label="Edit file"
              onClick={() => onEditFile(node.path)}
              className="p-1 rounded text-[var(--oh-muted)] hover:text-white hover:bg-[var(--oh-surface-raised)] cursor-pointer"
            >
              <Pencil className="w-3 h-3" />
            </button>
          )}
          <button
            type="button"
            title="Copy path"
            aria-label="Copy path"
            onClick={handleCopyPath}
            className="p-1 rounded text-[var(--oh-muted)] hover:text-white hover:bg-[var(--oh-surface-raised)] cursor-pointer"
          >
            <Copy className="w-3 h-3" />
          </button>
          {onRename && (
            <button
              type="button"
              title="Rename file"
              aria-label="Rename file"
              onClick={() => onRename(node.path, false)}
              className="p-1 rounded text-[var(--oh-muted)] hover:text-white hover:bg-[var(--oh-surface-raised)] cursor-pointer"
            >
              <Pencil className="w-3 h-3" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              title="Delete file"
              aria-label="Delete file"
              onClick={() => onDelete(node.path, false)}
              className="p-1 rounded text-[var(--oh-muted)] hover:text-red-400 hover:bg-[var(--oh-surface-raised)] cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

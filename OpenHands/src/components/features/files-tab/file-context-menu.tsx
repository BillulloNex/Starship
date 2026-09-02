/* eslint-disable i18next/no-literal-string */
import React, { useEffect, useRef } from "react";
import {
  FilePlus,
  FolderPlus,
  Pencil,
  Copy,
  Trash2,
  Files,
  X,
  XCircle,
} from "lucide-react";
import toast from "react-hot-toast";

export interface FileContextMenuProps {
  x: number;
  y: number;
  path: string;
  isDirectory: boolean;
  isTab?: boolean;
  onClose: () => void;
  onCreateFile?: (parentPath: string | null) => void;
  onCreateFolder?: (parentPath: string | null) => void;
  onRename?: (path: string, isDirectory: boolean) => void;
  onDuplicate?: (path: string) => void;
  onDelete?: (path: string, isDirectory: boolean) => void;
  onCloseTab?: (path: string) => void;
  onCloseOtherTabs?: (path: string) => void;
  onCloseAllTabs?: () => void;
}

export function FileContextMenu({
  x,
  y,
  path,
  isDirectory,
  isTab = false,
  onClose,
  onCreateFile,
  onCreateFolder,
  onRename,
  onDuplicate,
  onDelete,
  onCloseTab,
  onCloseOtherTabs,
  onCloseAllTabs,
}: FileContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click or escape
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("mousedown", handleMouseDown, true);
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("mousedown", handleMouseDown, true);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [onClose]);

  // Adjust positioning to stay within viewport
  const style: React.CSSProperties = {
    top: Math.min(y, window.innerHeight - 280),
    left: Math.min(x, window.innerWidth - 220),
  };

  const handleCopyRelativePath = () => {
    navigator.clipboard.writeText(path);
    toast.success(`Copied path: ${path}`);
    onClose();
  };

  const handleCopyFileName = () => {
    const filename = path.split("/").pop() || path;
    navigator.clipboard.writeText(filename);
    toast.success(`Copied filename: ${filename}`);
    onClose();
  };

  return (
    <div
      ref={menuRef}
      style={style}
      data-testid="file-context-menu"
      className="fixed z-50 w-52 rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface)] shadow-2xl py-1 text-xs text-[var(--oh-foreground)] select-none animate-in fade-in zoom-in-95 duration-100"
    >
      {/* Tab-specific actions */}
      {isTab ? (
        <>
          {onCloseTab && (
            <button
              type="button"
              onClick={() => {
                onCloseTab(path);
                onClose();
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-[var(--oh-surface-raised)] hover:text-white text-left cursor-pointer"
            >
              <X className="w-3.5 h-3.5 text-[var(--oh-muted)]" />
              <span>Close Tab</span>
            </button>
          )}
          {onCloseOtherTabs && (
            <button
              type="button"
              onClick={() => {
                onCloseOtherTabs(path);
                onClose();
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-[var(--oh-surface-raised)] hover:text-white text-left cursor-pointer"
            >
              <XCircle className="w-3.5 h-3.5 text-[var(--oh-muted)]" />
              <span>Close Others</span>
            </button>
          )}
          {onCloseAllTabs && (
            <button
              type="button"
              onClick={() => {
                onCloseAllTabs();
                onClose();
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-[var(--oh-surface-raised)] hover:text-white text-left cursor-pointer"
            >
              <XCircle className="w-3.5 h-3.5 text-[var(--oh-muted)]" />
              <span>Close All Tabs</span>
            </button>
          )}
          <div className="my-1 border-t border-[var(--oh-border-subtle)]" />
        </>
      ) : null}

      {/* Explorer / Tree actions */}
      {isDirectory ? (
        <>
          {onCreateFile && (
            <button
              type="button"
              onClick={() => {
                onCreateFile(path);
                onClose();
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-[var(--oh-surface-raised)] hover:text-white text-left cursor-pointer"
            >
              <FilePlus className="w-3.5 h-3.5 text-blue-400" />
              <span>New File...</span>
            </button>
          )}
          {onCreateFolder && (
            <button
              type="button"
              onClick={() => {
                onCreateFolder(path);
                onClose();
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-[var(--oh-surface-raised)] hover:text-white text-left cursor-pointer"
            >
              <FolderPlus className="w-3.5 h-3.5 text-amber-400" />
              <span>New Folder...</span>
            </button>
          )}
          <div className="my-1 border-t border-[var(--oh-border-subtle)]" />
        </>
      ) : (
        <>
          {onDuplicate && (
            <button
              type="button"
              onClick={() => {
                onDuplicate(path);
                onClose();
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-[var(--oh-surface-raised)] hover:text-white text-left cursor-pointer"
            >
              <Files className="w-3.5 h-3.5 text-emerald-400" />
              <span>Duplicate File</span>
            </button>
          )}
        </>
      )}

      {/* Rename */}
      {onRename && path && (
        <button
          type="button"
          onClick={() => {
            onRename(path, isDirectory);
            onClose();
          }}
          className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-[var(--oh-surface-raised)] hover:text-white text-left cursor-pointer"
        >
          <Pencil className="w-3.5 h-3.5 text-cyan-400" />
          <span>Rename...</span>
        </button>
      )}

      {/* Copy paths */}
      {path && (
        <>
          <div className="my-1 border-t border-[var(--oh-border-subtle)]" />
          <button
            type="button"
            onClick={handleCopyRelativePath}
            className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-[var(--oh-surface-raised)] hover:text-white text-left cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5 text-[var(--oh-muted)]" />
            <span>Copy Relative Path</span>
          </button>
          <button
            type="button"
            onClick={handleCopyFileName}
            className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-[var(--oh-surface-raised)] hover:text-white text-left cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5 text-[var(--oh-muted)]" />
            <span>Copy File Name</span>
          </button>
        </>
      )}

      {/* Delete */}
      {onDelete && path && (
        <>
          <div className="my-1 border-t border-[var(--oh-border-subtle)]" />
          <button
            type="button"
            onClick={() => {
              onDelete(path, isDirectory);
              onClose();
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-red-500/20 text-red-400 hover:text-red-300 text-left cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-400" />
            <span>Delete {isDirectory ? "Folder" : "File"}</span>
          </button>
        </>
      )}
    </div>
  );
}

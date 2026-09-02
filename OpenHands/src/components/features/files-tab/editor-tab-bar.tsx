/* eslint-disable i18next/no-literal-string */
import React, { useState } from "react";
import {
  X,
  Search,
  Code2,
  Eye,
  Columns,
  PanelLeft,
  PanelLeftClose,
} from "lucide-react";
import { useFilesTabStore } from "#/stores/files-tab-store";
import { FileTypeIcon } from "./file-type-icon";
import { FileContextMenu } from "./file-context-menu";
import { cn } from "#/utils/utils";
import { isMarkdownFilePath } from "#/utils/is-markdown-file-path";

interface EditorTabBarProps {
  onOpenSearchModal: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function EditorTabBar({
  onOpenSearchModal,
  onRefresh: _onRefresh,
  isRefreshing: _isRefreshing,
}: EditorTabBarProps) {
  const {
    openTabs,
    selectedPath,
    dirtyFiles,
    isSidebarCollapsed,
    previewModes,
    setSelectedPath,
    closeTab,
    closeOtherTabs,
    closeAllTabs,
    toggleSidebar,
    setFilePreviewMode,
  } = useFilesTabStore();

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    path: string;
  } | null>(null);

  const activePath = selectedPath;
  const isMdOrHtml =
    activePath &&
    (isMarkdownFilePath(activePath) ||
      activePath.endsWith(".html") ||
      activePath.endsWith(".htm") ||
      activePath.endsWith(".svg"));

  const currentPreviewMode = (activePath && previewModes[activePath]) || "code";

  const handleTabContextMenu = (e: React.MouseEvent, path: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      path,
    });
  };

  const handleTabMiddleClick = (e: React.MouseEvent, path: string) => {
    if (e.button === 1) {
      e.preventDefault();
      closeTab(path);
    }
  };

  return (
    <div
      data-testid="editor-tab-bar"
      className="flex items-center justify-between bg-[var(--oh-surface)] border-b border-[var(--oh-border)] h-9 select-none shrink-0"
    >
      {/* Tabs scroll area */}
      <div className="flex items-center h-full overflow-x-auto custom-scrollbar-always min-w-0 flex-1">
        {openTabs.map((tabPath) => {
          const isActive = tabPath === activePath;
          const isDirty = !!dirtyFiles[tabPath];
          const filename = tabPath.split("/").pop() || tabPath;

          return (
            <div
              key={tabPath}
              data-testid={`editor-tab-${tabPath}`}
              title={tabPath}
              onClick={() => setSelectedPath(tabPath)}
              onMouseDown={(e) => handleTabMiddleClick(e, tabPath)}
              onContextMenu={(e) => handleTabContextMenu(e, tabPath)}
              className={cn(
                "group relative flex items-center gap-1.5 h-full px-3 border-r border-[var(--oh-border-subtle)] text-xs cursor-pointer shrink-0 transition-colors",
                isActive
                  ? "bg-[#141414] text-white border-t-2 border-t-[var(--oh-interactive)]"
                  : "bg-[var(--oh-surface)] text-[var(--oh-text-tertiary)] hover:bg-[var(--oh-surface-raised)] hover:text-white",
              )}
            >
              <FileTypeIcon path={tabPath} className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate max-w-[140px] font-mono text-[11px]">
                {filename}
              </span>

              {/* Dirty dot or Close button */}
              <div className="flex items-center justify-center w-4 h-4 ml-1">
                {isDirty ? (
                  <span
                    data-testid={`tab-unsaved-dot-${tabPath}`}
                    className="w-2 h-2 rounded-full bg-amber-400 group-hover:hidden"
                  />
                ) : null}
                <button
                  type="button"
                  data-testid={`tab-close-button-${tabPath}`}
                  title="Close Tab (Cmd+W)"
                  aria-label="Close Tab"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tabPath);
                  }}
                  className={cn(
                    "p-0.5 rounded hover:bg-white/10 hover:text-white text-[var(--oh-muted)]",
                    isDirty ? "hidden group-hover:flex" : "flex",
                  )}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}

        {openTabs.length === 0 && (
          <div className="px-3 text-xs text-[var(--oh-muted)] italic">
            No files open
          </div>
        )}
      </div>

      {/* Right side controls */}
      <div className="flex items-center gap-1 px-2 shrink-0 border-l border-[var(--oh-border-subtle)] bg-[var(--oh-surface)]">
        {/* Preview / Split preview mode switcher for Markdown / HTML */}
        {isMdOrHtml && (
          <div className="flex items-center bg-[var(--oh-surface-raised)] rounded p-0.5 mr-1 border border-[var(--oh-border)]">
            <button
              type="button"
              title="Code View"
              aria-label="Code View"
              onClick={() =>
                activePath && setFilePreviewMode(activePath, "code")
              }
              className={cn(
                "p-1 rounded text-xs transition-colors cursor-pointer",
                currentPreviewMode === "code"
                  ? "bg-[var(--oh-interactive)] text-white"
                  : "text-[var(--oh-muted)] hover:text-white",
              )}
            >
              <Code2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title="Split View (Code + Preview)"
              aria-label="Split View"
              onClick={() =>
                activePath && setFilePreviewMode(activePath, "split")
              }
              className={cn(
                "p-1 rounded text-xs transition-colors cursor-pointer",
                currentPreviewMode === "split"
                  ? "bg-[var(--oh-interactive)] text-white"
                  : "text-[var(--oh-muted)] hover:text-white",
              )}
            >
              <Columns className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title="Preview View"
              aria-label="Preview View"
              onClick={() =>
                activePath && setFilePreviewMode(activePath, "preview")
              }
              className={cn(
                "p-1 rounded text-xs transition-colors cursor-pointer",
                currentPreviewMode === "preview"
                  ? "bg-[var(--oh-interactive)] text-white"
                  : "text-[var(--oh-muted)] hover:text-white",
              )}
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Quick Search / Cmd+P trigger */}
        <button
          type="button"
          data-testid="editor-quick-search-button"
          title="Quick Open File (⌘P / Ctrl+P)"
          aria-label="Quick Open File"
          onClick={onOpenSearchModal}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs text-[var(--oh-muted)] hover:text-white hover:bg-[var(--oh-surface-raised)] cursor-pointer"
        >
          <Search className="w-3.5 h-3.5" />
          <kbd className="text-[10px] font-mono opacity-70 bg-white/5 px-1 py-0.2 rounded border border-white/10">
            ⌘P
          </kbd>
        </button>

        {/* Sidebar Toggle */}
        <button
          type="button"
          data-testid="editor-toggle-sidebar-button"
          title={
            isSidebarCollapsed ? "Show File Explorer" : "Hide File Explorer"
          }
          aria-label="Toggle Sidebar"
          onClick={toggleSidebar}
          className="p-1.5 rounded text-[var(--oh-muted)] hover:text-white hover:bg-[var(--oh-surface-raised)] cursor-pointer"
        >
          {isSidebarCollapsed ? (
            <PanelLeft className="w-3.5 h-3.5" />
          ) : (
            <PanelLeftClose className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Tab context menu */}
      {contextMenu && (
        <FileContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          path={contextMenu.path}
          isDirectory={false}
          isTab
          onClose={() => setContextMenu(null)}
          onCloseTab={(path) => closeTab(path)}
          onCloseOtherTabs={(path) => closeOtherTabs(path)}
          onCloseAllTabs={() => closeAllTabs()}
        />
      )}
    </div>
  );
}

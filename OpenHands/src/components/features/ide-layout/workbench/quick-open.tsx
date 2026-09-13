/* eslint-disable i18next/no-literal-string */
import React, { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useWorkspaceRuntime } from "#/context/workspace-runtime-context";
import { useWorkspaceFiles } from "#/hooks/query/use-workspace-files";
import { useFilesTabStore } from "#/stores/files-tab-store";
import { useWorkbenchStore } from "#/stores/workbench-store";
import { FileTypeIcon } from "#/components/features/files-tab/file-type-icon";
import { sortFilesByPriority } from "#/utils/file-priority";
import { cn } from "#/utils/utils";
import type { WorkbenchCommand } from "./commands";
import { rankFuzzy } from "./fuzzy-match";
import { formatKeybinding, isMacPlatform } from "./keybindings";

const RESULT_LIMIT = 50;

interface QuickOpenItem {
  id: string;
  label: string;
  /** Indices of `label` characters to highlight. */
  highlights: number[];
  detail?: string;
  icon?: React.ReactNode;
  hint?: string;
  run: () => void;
}

function HighlightedText({
  text,
  highlights,
}: {
  text: string;
  highlights: number[];
}) {
  if (highlights.length === 0) return <>{text}</>;
  const marks = new Set(highlights);
  return (
    <>
      {text.split("").map((char, index) => (
        <span
          // Characters are positional; the index is the stable identity.
          key={index}
          className={marks.has(index) ? "text-[#7aa2ff]" : undefined}
        >
          {char}
        </span>
      ))}
    </>
  );
}

/** Maps match positions in a full path onto its file name. */
function basenameHighlights(path: string, positions: number[]): number[] {
  const start = path.lastIndexOf("/") + 1;
  return positions.filter((p) => p >= start).map((p) => p - start);
}

interface QuickOpenProps {
  commands: WorkbenchCommand[];
}

/**
 * VS Code-style quick open: file search by default, `>` for commands, and
 * `:` to jump to a line in the active editor.
 */
export function QuickOpen({ commands }: QuickOpenProps) {
  const { isOpen, query } = useWorkbenchStore((s) => s.quickOpen);
  if (!isOpen) return null;
  return createPortal(
    <QuickOpenDialog commands={commands} query={query} />,
    document.body,
  );
}

function QuickOpenDialog({
  commands,
  query,
}: QuickOpenProps & { query: string }) {
  const { workspaceKey } = useWorkspaceRuntime();
  const filesQuery = useWorkspaceFiles();
  const setQuery = useWorkbenchStore((s) => s.setQuickOpenQuery);
  const close = useWorkbenchStore((s) => s.closeQuickOpen);
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const isMac = isMacPlatform();

  const mode = query.startsWith(">")
    ? "commands"
    : query.startsWith(":")
      ? "line"
      : "files";
  const term = mode === "files" ? query : query.slice(1);

  const items = useMemo<QuickOpenItem[]>(() => {
    const focusEditorLater = () =>
      requestAnimationFrame(() => useWorkbenchStore.getState().editor?.focus());

    if (mode === "commands") {
      return rankFuzzy(term, commands, (c) => c.title, RESULT_LIMIT).map(
        ({ item, match }) => ({
          id: item.id,
          label: item.title,
          highlights: match.positions,
          hint: item.keybindings?.[0]
            ? formatKeybinding(item.keybindings[0], isMac)
            : undefined,
          run: item.run,
        }),
      );
    }

    if (mode === "line") {
      const editor = useWorkbenchStore.getState().editor;
      const lineCount = editor?.getModel()?.getLineCount() ?? 0;
      const line = Number.parseInt(term, 10);
      if (!editor || lineCount === 0) {
        return [
          {
            id: "line-unavailable",
            label: "Open a file to go to a line",
            highlights: [],
            run: () => {},
          },
        ];
      }
      if (!Number.isFinite(line)) {
        return [
          {
            id: "line-hint",
            label: `Type a line number between 1 and ${lineCount}`,
            highlights: [],
            run: () => {},
          },
        ];
      }
      const target = Math.min(Math.max(line, 1), lineCount);
      return [
        {
          id: "line-go",
          label: `Go to line ${target}`,
          highlights: [],
          run: () => {
            editor.setPosition({ lineNumber: target, column: 1 });
            editor.revealLineInCenter(target);
            focusEditorLater();
          },
        },
      ];
    }

    const openFile = (path: string) => {
      useFilesTabStore.getState().setSelectedPath(path, workspaceKey);
      focusEditorLater();
    };
    const files = (filesQuery.data ?? []).filter((p) => !p.endsWith("/"));

    if (!term.trim()) {
      const { openTabs, selectedConversationId } = useFilesTabStore.getState();
      const recent =
        selectedConversationId === workspaceKey ? [...openTabs].reverse() : [];
      const rest = sortFilesByPriority(
        files.filter((p) => !recent.includes(p)),
      );
      return [...recent, ...rest].slice(0, RESULT_LIMIT).map((path) => ({
        id: path,
        label: path.split("/").pop() ?? path,
        detail: path.slice(0, path.lastIndexOf("/")),
        highlights: [],
        icon: <FileTypeIcon path={path} className="h-4 w-4 shrink-0" />,
        run: () => openFile(path),
      }));
    }

    return rankFuzzy(term, files, (p) => p, RESULT_LIMIT).map(
      ({ item: path, match }) => {
        return {
          id: path,
          label: path.split("/").pop() ?? path,
          detail: path.slice(0, path.lastIndexOf("/")),
          highlights: basenameHighlights(path, match.positions),
          icon: <FileTypeIcon path={path} className="h-4 w-4 shrink-0" />,
          run: () => openFile(path),
        };
      },
    );
  }, [mode, term, commands, filesQuery.data, workspaceKey, isMac]);

  const safeIndex = Math.min(activeIndex, Math.max(items.length - 1, 0));

  const runItem = (item: QuickOpenItem | undefined) => {
    if (!item) return;
    close();
    item.run();
  };

  const moveActive = (delta: number) => {
    if (items.length === 0) return;
    const next = (safeIndex + delta + items.length) % items.length;
    setActiveIndex(next);
    listRef.current
      ?.querySelector(`[data-index="${next}"]`)
      ?.scrollIntoView({ block: "nearest" });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      runItem(items[safeIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
      useWorkbenchStore.getState().editor?.focus();
    }
  };

  const placeholder =
    mode === "commands"
      ? "Type a command"
      : mode === "line"
        ? "Go to line"
        : "Search files by name (> for commands, : for line)";

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center bg-black/30 pt-[12vh]"
      data-testid="ide-quick-open"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-label="Quick open"
        className="flex h-fit max-h-[60vh] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] shadow-2xl"
      >
        <input
          // The dialog exists to take a query; focusing it is the point.
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label={placeholder}
          aria-controls="ide-quick-open-results"
          data-testid="ide-quick-open-input"
          className="border-b border-[var(--oh-border)] bg-transparent px-3 py-2.5 text-sm text-white placeholder-[var(--oh-muted)] focus:outline-none"
        />
        <ul
          id="ide-quick-open-results"
          ref={listRef}
          role="listbox"
          className="min-h-0 overflow-y-auto p-1 custom-scrollbar-always"
        >
          {items.length === 0 && (
            <li className="px-3 py-6 text-center text-xs text-[var(--oh-muted)]">
              No results
            </li>
          )}
          {items.map((item, index) => (
            <li
              key={item.id}
              data-index={index}
              data-testid={`ide-quick-open-item-${item.id}`}
              role="option"
              aria-selected={index === safeIndex}
              onMouseMove={() => setActiveIndex(index)}
              onClick={() => runItem(item)}
              className={cn(
                "flex cursor-pointer select-none items-center gap-2 rounded px-2.5 py-1.5 text-xs",
                index === safeIndex
                  ? "bg-[var(--oh-interactive-hover)] text-white"
                  : "text-[var(--oh-text-tertiary)]",
              )}
            >
              {item.icon}
              <span className="shrink-0 font-medium text-white">
                <HighlightedText
                  text={item.label}
                  highlights={item.highlights}
                />
              </span>
              {item.detail && (
                <span className="min-w-0 truncate text-[11px] text-[var(--oh-muted)]">
                  {item.detail}
                </span>
              )}
              {item.hint && (
                <kbd className="ml-auto shrink-0 font-mono text-[11px] text-[var(--oh-muted)]">
                  {item.hint}
                </kbd>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

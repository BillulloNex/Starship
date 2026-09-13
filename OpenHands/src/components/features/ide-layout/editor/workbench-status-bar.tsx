/* eslint-disable i18next/no-literal-string */
import { useFilesTabStore } from "#/stores/files-tab-store";
import { useWorkbenchStore } from "#/stores/workbench-store";

interface WorkbenchStatusBarProps {
  path: string;
}

export function WorkbenchStatusBar({ path }: WorkbenchStatusBarProps) {
  const cursorPosition = useFilesTabStore((s) => s.cursorPosition);
  const info = useWorkbenchStore((s) => s.activeModelInfo);
  const isSaving = useWorkbenchStore((s) => !!s.savingPaths[path]);

  return (
    <footer
      data-testid="workbench-status-bar"
      className="flex h-6 shrink-0 select-none items-center justify-between gap-4 border-t border-[var(--oh-border-subtle)] bg-[var(--oh-surface)] px-3 text-[11px] text-[var(--oh-muted)]"
    >
      <span className="min-w-0 truncate">{isSaving ? "Saving…" : ""}</span>
      <div className="flex shrink-0 items-center gap-4">
        {cursorPosition && (
          <span>
            Ln {cursorPosition.line}, Col {cursorPosition.column}
          </span>
        )}
        {info && (
          <>
            <span>
              {info.insertSpaces ? "Spaces" : "Tab Size"}: {info.tabSize}
            </span>
            <span>UTF-8</span>
            <span>{info.eol}</span>
            <span>{info.language}</span>
          </>
        )}
      </div>
    </footer>
  );
}

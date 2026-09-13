/* eslint-disable i18next/no-literal-string */
import { useEffect, useState } from "react";
import { useMonaco } from "@monaco-editor/react";
import { CircleAlert, CircleX } from "lucide-react";
import { useWorkspaceRuntime } from "#/context/workspace-runtime-context";
import { useFilesTabStore } from "#/stores/files-tab-store";
import { useWorkbenchStore } from "#/stores/workbench-store";
import { countProblems } from "../workbench/language-features";

interface WorkbenchStatusBarProps {
  path: string;
}

function useProblemCounts(path: string) {
  const monaco = useMonaco();
  const { workspaceKey } = useWorkspaceRuntime();
  const [counts, setCounts] = useState({ errors: 0, warnings: 0 });

  useEffect(() => {
    if (!monaco || !workspaceKey) return undefined;
    const update = () => setCounts(countProblems(monaco, workspaceKey, path));
    update();
    const subscription = monaco.editor.onDidChangeMarkers(update);
    return () => subscription.dispose();
  }, [monaco, workspaceKey, path]);

  return counts;
}

export function WorkbenchStatusBar({ path }: WorkbenchStatusBarProps) {
  const cursorPosition = useFilesTabStore((s) => s.cursorPosition);
  const info = useWorkbenchStore((s) => s.activeModelInfo);
  const isSaving = useWorkbenchStore((s) => !!s.savingPaths[path]);
  const { errors, warnings } = useProblemCounts(path);

  return (
    <footer
      data-testid="workbench-status-bar"
      className="flex h-6 shrink-0 select-none items-center justify-between gap-4 border-t border-[var(--oh-border-subtle)] bg-[var(--oh-surface)] px-3 text-[11px] text-[var(--oh-muted)]"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="flex items-center gap-2"
          title={`${errors} errors, ${warnings} warnings`}
          data-testid="workbench-problem-counts"
        >
          <span className="flex items-center gap-0.5">
            <CircleX className="h-3 w-3" />
            {errors}
          </span>
          <span className="flex items-center gap-0.5">
            <CircleAlert className="h-3 w-3" />
            {warnings}
          </span>
        </span>
        {isSaving && <span>Saving…</span>}
      </div>
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

/* eslint-disable i18next/no-literal-string */
import { AlertTriangle } from "lucide-react";
import { useWorkspaceRuntime } from "#/context/workspace-runtime-context";
import { workbenchDocuments } from "../workbench/document-registry";
import { useWorkbenchSave } from "../workbench/use-workbench-save";

interface ConflictBannerProps {
  path: string;
}

/**
 * Shown when a file changed on disk (usually because the agent edited it)
 * while it had unsaved edits in the editor.
 */
export function ConflictBanner({ path }: ConflictBannerProps) {
  const { workspaceKey } = useWorkspaceRuntime();
  const save = useWorkbenchSave();
  const fileName = path.split("/").pop() ?? path;

  if (!workspaceKey) return null;

  const useDiskVersion = () => workbenchDocuments.takeDisk(workspaceKey, path);
  const keepMyVersion = () => {
    workbenchDocuments.keepMine(workspaceKey, path);
    save(path);
  };

  return (
    <div
      role="alert"
      data-testid="editor-conflict-banner"
      className="flex shrink-0 items-center gap-3 border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200"
    >
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium">{fileName}</span> changed on disk while
        you had unsaved edits.
      </span>
      <button
        type="button"
        onClick={useDiskVersion}
        data-testid="editor-conflict-use-disk"
        className="rounded px-2 py-0.5 text-amber-100 hover:bg-amber-500/20"
      >
        Use disk version
      </button>
      <button
        type="button"
        onClick={keepMyVersion}
        data-testid="editor-conflict-keep-mine"
        className="rounded bg-amber-500/20 px-2 py-0.5 font-medium text-amber-50 hover:bg-amber-500/30"
      >
        Keep mine
      </button>
    </div>
  );
}

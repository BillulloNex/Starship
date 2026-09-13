import { useWorkbenchStore } from "#/stores/workbench-store";
import { ConflictBanner } from "./conflict-banner";
import { WorkbenchEditor } from "./workbench-editor";

interface DocumentEditorProps {
  path: string;
  /** Current disk content, or `null` while the file is being re-read. */
  diskText: string | null;
}

/**
 * The workbench editor with its conflict banner, for surfaces outside the
 * IDE layout (the Agent view's Files tab).
 */
export function DocumentEditor({ path, diskText }: DocumentEditorProps) {
  const hasConflict = useWorkbenchStore((s) => !!s.conflicts[path]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-[#141414]">
      {hasConflict && <ConflictBanner path={path} />}
      <div className="min-h-0 flex-1">
        <WorkbenchEditor path={path} diskText={diskText} />
      </div>
    </div>
  );
}

import { useCallback } from "react";
import { useWorkspaceRuntime } from "#/context/workspace-runtime-context";
import { useWorkspaceFileReader } from "#/hooks/query/use-workspace-file-content";
import { useSaveWorkspaceFile } from "#/hooks/mutation/use-workspace-file-mutations";
import { useWorkbenchStore } from "#/stores/workbench-store";
import { workbenchDocuments } from "./document-registry";

export interface SaveOptions {
  /** Write even if the file changed on disk since it was loaded. */
  overwrite?: boolean;
}

export type SaveOutcome = "saved" | "clean" | "conflict" | "failed";

const inFlight = new Map<string, Promise<SaveOutcome>>();

/**
 * Saves an open document without ever silently clobbering someone else's
 * write: right before saving, the file is re-read and, if it no longer
 * matches what the buffer was loaded from, the save stops and the document
 * is flagged as a conflict for the user to resolve.
 */
export function useWorkbenchSave() {
  const { workspaceKey } = useWorkspaceRuntime();
  const readFile = useWorkspaceFileReader();
  const { mutateAsync: saveFile } = useSaveWorkspaceFile();

  return useCallback(
    (path: string, { overwrite = false }: SaveOptions = {}) => {
      if (!workspaceKey) return Promise.resolve<SaveOutcome>("failed");
      const key = `${workspaceKey} ${path}`;
      const pending = inFlight.get(key);
      if (pending) return pending;

      const run = async (): Promise<SaveOutcome> => {
        if (!workbenchDocuments.isDirty(workspaceKey, path)) return "clean";
        if (
          !overwrite &&
          workbenchDocuments.getConflict(workspaceKey, path) !== null
        ) {
          return "conflict";
        }

        if (!overwrite) {
          const onDisk = await readFile(path).catch(() => null);
          const baseline = workbenchDocuments.getBaseline(workspaceKey, path);
          if (onDisk?.text != null && onDisk.text !== baseline) {
            workbenchDocuments.flagConflict(workspaceKey, path, onDisk.text);
            return "conflict";
          }
        }

        const snapshot = workbenchDocuments.snapshot(workspaceKey, path);
        if (!snapshot) return "failed";

        try {
          await saveFile({ path, content: snapshot.text, source: "editor" });
        } catch {
          return "failed";
        }
        workbenchDocuments.markSaved(workspaceKey, path, snapshot);
        return "saved";
      };

      const { setSaving } = useWorkbenchStore.getState();
      setSaving(path, true);
      const promise = run().finally(() => {
        inFlight.delete(key);
        setSaving(path, false);
      });
      inFlight.set(key, promise);
      return promise;
    },
    [workspaceKey, readFile, saveFile],
  );
}

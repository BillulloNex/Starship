import { useEffect } from "react";
import { useWorkspaceRuntime } from "#/context/workspace-runtime-context";
import { useFilesTabStore } from "#/stores/files-tab-store";
import { useWorkbenchStore } from "#/stores/workbench-store";
import { workbenchDocuments } from "./document-registry";
import { useWorkbenchSave } from "./use-workbench-save";

/**
 * Keeps open documents in step with the editor tabs:
 * - a closed tab's model is saved (if dirty) and then freed;
 * - a reopened tab gets its dirty/conflict markers back;
 * - switching workspaces resets the tabs and frees clean documents.
 * It also warns before the page unloads with unsaved edits.
 */
export function useDocumentLifecycle() {
  const { workspaceKey } = useWorkspaceRuntime();
  const save = useWorkbenchSave();

  // Tabs from another conversation's workspace don't belong here.
  useEffect(() => {
    if (!workspaceKey) return;
    const { selectedConversationId, setSelectedPath } =
      useFilesTabStore.getState();
    if (selectedConversationId !== workspaceKey) {
      setSelectedPath(null, workspaceKey);
    }
    workbenchDocuments.closeCleanOutside(workspaceKey);
  }, [workspaceKey]);

  useEffect(() => {
    if (!workspaceKey) return undefined;

    return useFilesTabStore.subscribe((state, previous) => {
      if (state.openTabs === previous.openTabs) return;
      if (state.selectedConversationId !== workspaceKey) return;

      const current = new Set(state.openTabs);
      const before = new Set(previous.openTabs);

      previous.openTabs
        .filter((path) => !current.has(path))
        .forEach(async (path) => {
          if (workbenchDocuments.isDirty(workspaceKey, path)) {
            const outcome = await save(path);
            if (outcome !== "saved") return;
          }
          if (!useFilesTabStore.getState().openTabs.includes(path)) {
            workbenchDocuments.close(workspaceKey, path);
          }
        });

      state.openTabs
        .filter((path) => !before.has(path))
        .forEach((path) => {
          if (workbenchDocuments.isDirty(workspaceKey, path)) {
            state.setFileDirty(path, true);
          }
          if (workbenchDocuments.getConflict(workspaceKey, path) !== null) {
            useWorkbenchStore.getState().setConflict(path, true);
          }
        });
    });
  }, [workspaceKey, save]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (workbenchDocuments.dirtyPaths().length === 0) return;
      event.preventDefault();
      // Required by some browsers to show the confirmation dialog.
      // eslint-disable-next-line no-param-reassign
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);
}

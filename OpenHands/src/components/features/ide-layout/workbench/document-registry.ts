import { useFilesTabStore } from "#/stores/files-tab-store";
import { useWorkbenchStore } from "#/stores/workbench-store";
import { WorkbenchDocuments } from "./documents";

function isCurrentWorkspace(workspaceKey: string): boolean {
  return useFilesTabStore.getState().selectedConversationId === workspaceKey;
}

/**
 * The app-wide document registry. Dirty and conflict changes are mirrored
 * into the stores the tab bar and conflict banner read from, but only for
 * the workspace currently on screen.
 */
export const workbenchDocuments = new WorkbenchDocuments({
  onDirtyChange: (workspaceKey, path, dirty) => {
    if (isCurrentWorkspace(workspaceKey)) {
      useFilesTabStore.getState().setFileDirty(path, dirty);
    }
  },
  onConflictChange: (workspaceKey, path, hasConflict) => {
    if (isCurrentWorkspace(workspaceKey)) {
      useWorkbenchStore.getState().setConflict(path, hasConflict);
    }
  },
});

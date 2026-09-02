import { useWorkspaceRuntime } from "#/context/workspace-runtime-context";
import { useFilesTabStore } from "#/stores/files-tab-store";

/**
 * Returns the selected file path only when it belongs to the active
 * workspace. Prevents stale selections from leaking when switching
 * conversations or standalone roots.
 */
export function useSelectedWorkspaceFile(): string | null {
  const { workspaceKey } = useWorkspaceRuntime();
  const selectedPath = useFilesTabStore((s) => s.selectedPath);
  const selectedConversationId = useFilesTabStore(
    (s) => s.selectedConversationId,
  );

  return selectedConversationId === workspaceKey ? selectedPath : null;
}

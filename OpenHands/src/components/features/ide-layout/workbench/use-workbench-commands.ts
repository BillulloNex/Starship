import { useEffect, useMemo } from "react";
import { useWorkspaceRuntime } from "#/context/workspace-runtime-context";
import { useFilesTabStore } from "#/stores/files-tab-store";
import { useIdeViewStore } from "#/stores/ide-view-store";
import { useWorkbenchStore } from "#/stores/workbench-store";
import { createWorkbenchCommands, type WorkbenchCommand } from "./commands";
import { isMacPlatform, matchesKeybinding } from "./keybindings";
import { useWorkbenchSave } from "./use-workbench-save";

/** The IDE command list, bound to the live workbench state. */
export function useWorkbenchCommands(): WorkbenchCommand[] {
  const { workspaceKey } = useWorkspaceRuntime();
  const save = useWorkbenchSave();
  const toggleViewMode = useIdeViewStore((s) => s.toggleViewMode);

  return useMemo(() => {
    const activePath = () => {
      const { selectedPath, selectedConversationId } =
        useFilesTabStore.getState();
      return selectedConversationId === workspaceKey ? selectedPath : null;
    };

    return createWorkbenchCommands({
      isMac: isMacPlatform(),
      getApi: () => useWorkbenchStore.getState().api,
      openQuickOpen: (mode) => useWorkbenchStore.getState().openQuickOpen(mode),
      saveActiveFile: () => {
        const path = activePath();
        if (path) save(path);
      },
      closeActiveTab: () => {
        const path = activePath();
        if (path) useFilesTabStore.getState().closeTab(path);
      },
      toggleViewMode,
    });
  }, [workspaceKey, save, toggleViewMode]);
}

/**
 * Dispatches IDE keybindings. Listens in the capture phase so shortcuts work
 * even while Monaco, xterm, or the chat input has focus.
 */
export function useWorkbenchKeybindings(commands: WorkbenchCommand[]) {
  useEffect(() => {
    const isMac = isMacPlatform();
    const bound = commands.filter(
      (command) => command.keybindings && !command.displayOnlyKeybinding,
    );

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      const command = bound.find((candidate) =>
        candidate.keybindings!.some((binding) =>
          matchesKeybinding(event, binding, isMac),
        ),
      );
      if (!command) return;
      event.preventDefault();
      event.stopPropagation();
      command.run();
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () =>
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [commands]);
}

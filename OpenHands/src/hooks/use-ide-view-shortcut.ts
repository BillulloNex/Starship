import React from "react";
import { useIdeViewStore } from "#/stores/ide-view-store";
import {
  isMacPlatform,
  matchesKeybinding,
} from "#/components/features/ide-layout/workbench/keybindings";
import { getToggleViewModeKeybinding } from "#/components/features/ide-layout/workbench/commands";

/**
 * Global keyboard shortcut for toggling IDE mode: ⌘⇧I on macOS, Ctrl+Alt+I
 * elsewhere (Ctrl+Shift+I is reserved for DevTools there).
 *
 * Mount this once inside the conversation route.
 */
export function useIdeViewShortcut() {
  const toggleViewMode = useIdeViewStore((s) => s.toggleViewMode);

  React.useEffect(() => {
    const isMac = isMacPlatform();
    const binding = getToggleViewModeKeybinding(isMac);
    const handler = (e: KeyboardEvent) => {
      if (matchesKeybinding(e, binding, isMac)) {
        e.preventDefault();
        e.stopPropagation();
        toggleViewMode();
      }
    };

    window.addEventListener("keydown", handler, { capture: true });
    return () =>
      window.removeEventListener("keydown", handler, { capture: true });
  }, [toggleViewMode]);
}

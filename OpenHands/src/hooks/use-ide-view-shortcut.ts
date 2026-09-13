import React from "react";
import { useIdeViewStore } from "#/stores/ide-view-store";

/**
 * Global keyboard shortcut for toggling IDE mode.
 * Cmd+Shift+I (Mac) / Ctrl+Shift+I (other) toggles between agent and IDE view.
 *
 * Mount this once inside the conversation route.
 */
export function useIdeViewShortcut() {
  const toggleViewMode = useIdeViewStore((s) => s.toggleViewMode);

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Cmd+Shift+I (Mac) or Ctrl+Shift+I (Windows/Linux)
      if (e.shiftKey && (e.metaKey || e.ctrlKey) && e.key === "I") {
        e.preventDefault();
        e.stopPropagation();
        toggleViewMode();
      }
    };

    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [toggleViewMode]);
}

import type { DockviewApi } from "dockview-react";
import type { QuickOpenMode } from "#/stores/workbench-store";
import type { Keybinding } from "./keybindings";
import { addWorkbenchPanel, toggleWorkbenchPanel } from "./panels";

export interface WorkbenchCommandContext {
  getApi: () => DockviewApi | null;
  openQuickOpen: (mode: QuickOpenMode) => void;
  focusSearch: () => void;
  addSelectionToChat: () => void;
  saveActiveFile: () => void;
  closeActiveTab: () => void;
  toggleViewMode: () => void;
  isMac: boolean;
}

export interface WorkbenchCommand {
  id: string;
  title: string;
  keybindings?: Keybinding[];
  /**
   * Bound elsewhere (e.g. the app-wide Agent ↔ IDE shortcut); the keybinding
   * is only shown in the palette, not dispatched by the workbench.
   */
  displayOnlyKeybinding?: boolean;
  /**
   * Keeps the keybinding working while a terminal has focus even when it
   * uses Control (which would otherwise go to the shell, e.g. Ctrl+B, Ctrl+W).
   */
  runsInTerminal?: boolean;
  run: () => void;
}

/**
 * ⌘⇧I on macOS. Ctrl+Shift+I opens DevTools on Windows/Linux browsers, so
 * those platforms use Ctrl+Alt+I instead.
 */
export function getToggleViewModeKeybinding(isMac: boolean): Keybinding {
  return isMac
    ? { code: "KeyI", mod: true, shift: true }
    : { code: "KeyI", mod: true, alt: true };
}

export const KEYBINDINGS = {
  quickOpen: { code: "KeyP", mod: true },
  commandPalette: { code: "KeyP", mod: true, shift: true },
  goToLine: { code: "KeyG", ctrl: true },
  save: { code: "KeyS", mod: true },
  closeTab: { code: "KeyW", mod: true },
  toggleExplorer: { code: "KeyB", mod: true },
  findInFiles: { code: "KeyF", mod: true, shift: true },
  addToChat: { code: "KeyL", mod: true },
  review: { code: "KeyG", mod: true, shift: true },
  toggleTerminal: { code: "Backquote", ctrl: true },
  toggleTerminalAlt: { code: "KeyJ", mod: true },
  toggleChat: { code: "KeyB", mod: true, alt: true },
} satisfies Record<string, Keybinding>;

export function createWorkbenchCommands(
  ctx: WorkbenchCommandContext,
): WorkbenchCommand[] {
  const withApi = (fn: (api: DockviewApi) => void) => () => {
    const api = ctx.getApi();
    if (api) fn(api);
  };

  return [
    {
      id: "workbench.quickOpen",
      title: "Go to File…",
      keybindings: [KEYBINDINGS.quickOpen],
      runsInTerminal: true,
      run: () => ctx.openQuickOpen("files"),
    },
    {
      id: "workbench.commandPalette",
      title: "Show All Commands",
      keybindings: [KEYBINDINGS.commandPalette],
      runsInTerminal: true,
      run: () => ctx.openQuickOpen("commands"),
    },
    {
      id: "editor.goToLine",
      title: "Go to Line…",
      keybindings: [KEYBINDINGS.goToLine],
      run: () => ctx.openQuickOpen("line"),
    },
    {
      id: "chat.addSelection",
      title: "Add Selection to Chat",
      keybindings: [KEYBINDINGS.addToChat],
      run: ctx.addSelectionToChat,
    },
    {
      id: "file.save",
      title: "Save File",
      keybindings: [KEYBINDINGS.save],
      run: ctx.saveActiveFile,
    },
    {
      id: "file.closeTab",
      title: "Close Editor Tab",
      keybindings: [KEYBINDINGS.closeTab],
      run: ctx.closeActiveTab,
    },
    {
      id: "view.toggleExplorer",
      title: "Toggle Explorer",
      keybindings: [KEYBINDINGS.toggleExplorer],
      run: withApi((api) => toggleWorkbenchPanel(api, "explorer")),
    },
    {
      id: "workbench.findInFiles",
      title: "Find in Files",
      keybindings: [KEYBINDINGS.findInFiles],
      run: withApi((api) => {
        addWorkbenchPanel(api, "search");
        ctx.focusSearch();
      }),
    },
    {
      id: "view.toggleTerminal",
      title: "Toggle Terminal",
      keybindings: [KEYBINDINGS.toggleTerminal, KEYBINDINGS.toggleTerminalAlt],
      runsInTerminal: true,
      run: withApi((api) => toggleWorkbenchPanel(api, "terminal")),
    },
    {
      id: "view.toggleChat",
      title: "Toggle Chat",
      keybindings: [KEYBINDINGS.toggleChat],
      run: withApi((api) => toggleWorkbenchPanel(api, "chat")),
    },
    {
      id: "view.review",
      title: "Review Changes",
      keybindings: [KEYBINDINGS.review],
      run: withApi((api) => addWorkbenchPanel(api, "review")),
    },
    {
      id: "view.showChanges",
      title: "Show Git Diff",
      run: withApi((api) => addWorkbenchPanel(api, "changes")),
    },
    {
      id: "view.showBrowser",
      title: "Show Browser",
      run: withApi((api) => addWorkbenchPanel(api, "browser")),
    },
    {
      id: "view.showTasks",
      title: "Show Tasks",
      run: withApi((api) => addWorkbenchPanel(api, "tasks")),
    },
    {
      id: "view.toggleAgentView",
      title: "Switch to Agent View",
      keybindings: [getToggleViewModeKeybinding(ctx.isMac)],
      displayOnlyKeybinding: true,
      run: ctx.toggleViewMode,
    },
  ];
}

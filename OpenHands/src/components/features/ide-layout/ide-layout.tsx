import React from "react";
import {
  DockviewReact,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
} from "dockview-react";
import "dockview-react/dist/styles/dockview.css";
import "#/styles/dockview-theme.css";

import { useAutoRefreshFilesOnEdit } from "#/hooks/use-auto-refresh-files-on-edit";
import { useWorkbenchStore } from "#/stores/workbench-store";
import { ExplorerPanel } from "./panels/explorer-panel";
import { EditorPanel } from "./panels/editor-panel";
import { TerminalPanel } from "./panels/terminal-panel";
import { ChatPanel } from "./panels/chat-panel";
import {
  ChangesPanel,
  TasksPanel,
  WebBrowserPanel,
} from "./panels/auxiliary-panels";
import {
  applyDefaultDockSizes,
  applyDefaultLayout,
  type WorkbenchPanelId,
} from "./workbench/panels";
import {
  useWorkbenchCommands,
  useWorkbenchKeybindings,
} from "./workbench/use-workbench-commands";
import { useDocumentLifecycle } from "./workbench/use-document-lifecycle";
import { QuickOpen } from "./workbench/quick-open";

const panelComponents: Record<
  WorkbenchPanelId,
  React.FC<IDockviewPanelProps>
> = {
  explorer: () => <ExplorerPanel />,
  editor: () => <EditorPanel />,
  terminal: () => <TerminalPanel />,
  chat: () => <ChatPanel />,
  changes: () => <ChangesPanel />,
  browser: () => <WebBrowserPanel />,
  tasks: () => <TasksPanel />,
};

/**
 * IdeLayout — the IDE view: a dockview workbench with the file explorer on
 * the left, the editor with the terminal below it in the middle, and the
 * agent chat on the right. Panels can be resized, dragged, closed, and
 * reopened from the header, the command palette (⌘⇧P), or their shortcuts.
 * The layout is not persisted between visits.
 */
export function IdeLayout() {
  const commands = useWorkbenchCommands();
  useWorkbenchKeybindings(commands);
  useDocumentLifecycle();
  useAutoRefreshFilesOnEdit();

  const subscriptions = React.useRef<{ dispose: () => void }[]>([]);

  const onReady = React.useCallback((event: DockviewReadyEvent) => {
    const { api } = event;
    const { setApi, setOpenPanels } = useWorkbenchStore.getState();
    const publishPanels = () => setOpenPanels(api.panels.map((p) => p.id));

    applyDefaultLayout(api);
    setApi(api);
    publishPanels();
    subscriptions.current = [
      api.onDidAddPanel(publishPanels),
      api.onDidRemovePanel(publishPanels),
    ];

    // Dock sizes only stick once the grid has real dimensions, which may be
    // after this first render.
    const sizeDocks = () => {
      if (api.width === 0 || api.height === 0) return false;
      applyDefaultDockSizes(api);
      return true;
    };
    if (!sizeDocks()) {
      const pending = api.onDidLayoutChange(() => {
        if (sizeDocks()) pending.dispose();
      });
      subscriptions.current.push(pending);
    }
  }, []);

  React.useEffect(
    () => () => {
      subscriptions.current.forEach((subscription) => subscription.dispose());
      subscriptions.current = [];
      const { setApi, setOpenPanels, closeQuickOpen } =
        useWorkbenchStore.getState();
      setApi(null);
      setOpenPanels([]);
      closeQuickOpen();
    },
    [],
  );

  return (
    <div className="h-full w-full" data-testid="ide-layout">
      <DockviewReact
        className="dockview-theme-dark"
        onReady={onReady}
        components={panelComponents}
      />
      <QuickOpen commands={commands} />
    </div>
  );
}

import React from "react";
import {
  DockviewReact,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
} from "dockview-react";
import "dockview-react/dist/styles/dockview.css";
import "#/styles/dockview-theme.css";

import { EditorPanel } from "./panels/editor-panel";
import { TerminalPanel } from "./panels/terminal-panel";
import { ChatPanel } from "./panels/chat-panel";

/**
 * Panel component registry for dockview.
 * Each key maps to a React component that renders inside a dockview panel.
 */
const panelComponents: Record<
  string,
  React.FC<IDockviewPanelProps>
> = {
  editor: () => <EditorPanel />,
  terminal: () => <TerminalPanel />,
  chat: () => <ChatPanel />,
};

/**
 * IdeLayout — the main IDE view component.
 *
 * Renders a dockview grid with three default panels:
 * - Editor (center, largest area — file tree + Monaco + tabs)
 * - Terminal (bottom of editor, shorter)
 * - Chat (right side)
 *
 * All panels are resizable and draggable. The layout is not persisted
 * (per user request) but starts with sensible defaults.
 */
export function IdeLayout() {
  const onReady = React.useCallback((event: DockviewReadyEvent) => {
    const api = event.api;

    // Create the main editor panel (center)
    const editorPanel = api.addPanel({
      id: "editor",
      component: "editor",
      title: "Editor",
    });

    // Create the terminal panel (below editor)
    api.addPanel({
      id: "terminal",
      component: "terminal",
      title: "Terminal",
      position: {
        referencePanel: editorPanel,
        direction: "below",
      },
      initialHeight: 250,
    });

    // Create the chat panel (right side)
    api.addPanel({
      id: "chat",
      component: "chat",
      title: "AI Chat",
      position: {
        referencePanel: editorPanel,
        direction: "right",
      },
      initialWidth: 380,
    });
  }, []);

  return (
    <div className="h-full w-full" data-testid="ide-layout">
      <DockviewReact
        className="dockview-theme-dark"
        onReady={onReady}
        components={panelComponents}
      />
    </div>
  );
}

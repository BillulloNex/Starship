import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkbenchStore } from "#/stores/workbench-store";
import { IdeHeader } from "#/components/features/ide-layout/ide-header";
import { IdeLayout } from "#/components/features/ide-layout/ide-layout";

vi.mock("#/context/workspace-runtime-context", () => ({
  useWorkspaceRuntime: () => ({ workspaceKey: "ws" }),
}));
vi.mock("#/hooks/use-auto-refresh-files-on-edit", () => ({
  useAutoRefreshFilesOnEdit: () => {},
}));
vi.mock(
  "#/components/features/ide-layout/workbench/use-workbench-save",
  () => ({
    useWorkbenchSave: () => vi.fn(),
  }),
);
vi.mock("#/hooks/query/use-workspace-files", () => ({
  useWorkspaceFiles: () => ({ data: [], isLoading: false }),
}));
vi.mock("#/components/features/ide-layout/panels/explorer-panel", () => ({
  ExplorerPanel: () => <div data-testid="panel-explorer" />,
}));
vi.mock("#/components/features/ide-layout/panels/editor-panel", () => ({
  EditorPanel: () => <div data-testid="panel-editor" />,
}));
vi.mock("#/components/features/ide-layout/panels/terminal-panel", () => ({
  TerminalPanel: () => <div data-testid="panel-terminal" />,
}));
vi.mock("#/components/features/ide-layout/panels/chat-panel", () => ({
  ChatPanel: () => <div data-testid="panel-chat" />,
}));
vi.mock(
  "#/components/features/conversation/conversation-name-with-status",
  () => ({
    ConversationNameWithStatus: () => <div />,
  }),
);
vi.mock("#/hooks/use-breakpoint", () => ({
  useBreakpoint: () => false,
  SIDEBAR_RAIL_COLLAPSE_MAX_WIDTH: 767,
}));

function renderIde() {
  return render(
    <div style={{ width: 1200, height: 800 }}>
      <IdeHeader />
      <IdeLayout />
    </div>,
  );
}

describe("IDE layout", () => {
  beforeEach(() => {
    useWorkbenchStore.setState({
      api: null,
      openPanels: [],
      quickOpen: { isOpen: false, query: "" },
    });
  });

  it("opens the default panels and publishes them to the header", () => {
    renderIde();
    expect([...useWorkbenchStore.getState().openPanels].sort()).toEqual(
      ["chat", "editor", "explorer", "terminal"].sort(),
    );
    expect(screen.getByTestId("ide-toggle-terminal")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("closes and reopens a panel from the header", async () => {
    const user = userEvent.setup();
    renderIde();

    await user.click(screen.getByTestId("ide-toggle-terminal"));
    expect(useWorkbenchStore.getState().openPanels).not.toContain("terminal");
    expect(screen.getByTestId("ide-toggle-terminal")).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await user.click(screen.getByTestId("ide-toggle-terminal"));
    expect(useWorkbenchStore.getState().openPanels).toContain("terminal");
  });

  it("toggles panels and opens the palette with keyboard shortcuts", () => {
    renderIde();

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { code: "Backquote", ctrlKey: true }),
      );
    });
    expect(useWorkbenchStore.getState().openPanels).not.toContain("terminal");

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          code: "KeyP",
          ctrlKey: true,
          metaKey: false,
          shiftKey: true,
        }),
      );
    });
    // jsdom reports a non-Mac user agent, so mod is Ctrl.
    expect(useWorkbenchStore.getState().quickOpen).toEqual({
      isOpen: true,
      query: ">",
    });
  });

  it("leaves Control chords to the shell while a terminal has focus", () => {
    renderIde();
    const xterm = document.createElement("div");
    xterm.className = "xterm";
    const textarea = document.createElement("textarea");
    xterm.appendChild(textarea);
    document.body.appendChild(xterm);

    // Ctrl+B (non-Mac "toggle explorer") is tmux/readline input in a shell.
    const ctrlB = new KeyboardEvent("keydown", {
      code: "KeyB",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      textarea.dispatchEvent(ctrlB);
    });
    expect(ctrlB.defaultPrevented).toBe(false);
    expect(useWorkbenchStore.getState().openPanels).toContain("explorer");

    // The terminal toggle still works from inside the terminal.
    act(() => {
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", {
          code: "Backquote",
          ctrlKey: true,
          bubbles: true,
        }),
      );
    });
    expect(useWorkbenchStore.getState().openPanels).not.toContain("terminal");
    xterm.remove();
  });

  it("releases the dockview API on unmount", () => {
    const { unmount } = renderIde();
    expect(useWorkbenchStore.getState().api).not.toBeNull();
    unmount();
    expect(useWorkbenchStore.getState().api).toBeNull();
    expect(useWorkbenchStore.getState().openPanels).toEqual([]);
  });
});

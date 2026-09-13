import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFilesTabStore } from "#/stores/files-tab-store";
import { useWorkbenchStore } from "#/stores/workbench-store";
import { QuickOpen } from "#/components/features/ide-layout/workbench/quick-open";
import type { WorkbenchCommand } from "#/components/features/ide-layout/workbench/commands";

vi.mock("#/context/workspace-runtime-context", () => ({
  useWorkspaceRuntime: () => ({ workspaceKey: "ws" }),
}));

vi.mock("#/hooks/query/use-workspace-files", () => ({
  useWorkspaceFiles: () => ({
    data: [
      "src/",
      "src/app.tsx",
      "src/components/workspace-file-browser.tsx",
      "README.md",
    ],
    isLoading: false,
  }),
}));

describe("QuickOpen", () => {
  const toggleTerminal = vi.fn();
  const commands: WorkbenchCommand[] = [
    {
      id: "view.toggleTerminal",
      title: "Toggle Terminal",
      keybindings: [{ code: "Backquote", ctrl: true }],
      run: toggleTerminal,
    },
    { id: "view.showChanges", title: "Show Changes", run: vi.fn() },
  ];

  beforeEach(() => {
    // jsdom doesn't implement scrolling.
    Element.prototype.scrollIntoView = vi.fn();
    toggleTerminal.mockReset();
    useWorkbenchStore.setState({ quickOpen: { isOpen: false, query: "" } });
    useFilesTabStore.setState({
      selectedConversationId: "ws",
      selectedPath: null,
      openTabs: [],
    });
  });

  it("renders nothing while closed", () => {
    render(<QuickOpen commands={commands} />);
    expect(screen.queryByTestId("ide-quick-open")).not.toBeInTheDocument();
  });

  it("fuzzy-finds files and opens the chosen one", async () => {
    const user = userEvent.setup();
    useWorkbenchStore.getState().openQuickOpen("files");
    render(<QuickOpen commands={commands} />);

    await user.type(screen.getByTestId("ide-quick-open-input"), "wfb");
    expect(
      screen.getByTestId(
        "ide-quick-open-item-src/components/workspace-file-browser.tsx",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("ide-quick-open-item-README.md"),
    ).not.toBeInTheDocument();

    await user.keyboard("{Enter}");
    expect(useFilesTabStore.getState().selectedPath).toBe(
      "src/components/workspace-file-browser.tsx",
    );
    expect(useWorkbenchStore.getState().quickOpen.isOpen).toBe(false);
  });

  it("lists commands after a > prefix and runs them", async () => {
    const user = userEvent.setup();
    useWorkbenchStore.getState().openQuickOpen("commands");
    render(<QuickOpen commands={commands} />);

    await user.type(screen.getByTestId("ide-quick-open-input"), "term");
    expect(
      screen.getByTestId("ide-quick-open-item-view.toggleTerminal"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("ide-quick-open-item-view.showChanges"),
    ).not.toBeInTheDocument();

    await user.keyboard("{Enter}");
    expect(toggleTerminal).toHaveBeenCalledOnce();
  });

  it("moves the selection with the arrow keys", async () => {
    const user = userEvent.setup();
    useWorkbenchStore.getState().openQuickOpen("commands");
    render(<QuickOpen commands={commands} />);

    const [first, second] = screen.getAllByRole("option");
    expect(first).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowDown}");
    expect(second).toHaveAttribute("aria-selected", "true");
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    useWorkbenchStore.getState().openQuickOpen("files");
    render(<QuickOpen commands={commands} />);
    await user.keyboard("{Escape}");
    expect(useWorkbenchStore.getState().quickOpen.isOpen).toBe(false);
  });
});

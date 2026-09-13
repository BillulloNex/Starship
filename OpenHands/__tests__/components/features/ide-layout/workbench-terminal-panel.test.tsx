import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

let support = { isSupported: false, isChecking: false };
const createTerminalSession = vi.fn();
const closeTerminalSession = vi.fn();

vi.mock("#/context/workspace-runtime-context", () => ({
  useWorkspaceRuntime: () => ({
    workspaceKey: "ws",
    conversationUrl: "http://localhost:8000/api/conversations/conv",
    sessionApiKey: "conv-key",
    workingDir: "/workspace/project",
  }),
}));

vi.mock(
  "#/components/features/ide-layout/terminal/use-workbench-terminal-support",
  () => ({ useWorkbenchTerminalSupport: () => support }),
);

vi.mock("#/components/features/terminal/terminal", () => ({
  default: () => <div data-testid="legacy-terminal" />,
}));

vi.mock("#/hooks/use-terminal", () => ({
  useTerminal: () => ({ ref: { current: null } }),
}));

vi.mock(
  "#/components/features/ide-layout/terminal/terminal-sessions",
  async () => {
    const { create } = await import("zustand");
    const store = create<{
      sessions: {
        id: string;
        workspaceKey: string;
        title: string;
        status: string;
      }[];
      activeId: string | null;
      setActiveId: (id: string) => void;
    }>()((set) => ({
      sessions: [],
      activeId: null,
      setActiveId: (activeId) => set({ activeId }),
    }));
    return {
      useTerminalSessionsStore: store,
      createTerminalSession: (...args: unknown[]) =>
        createTerminalSession(...args),
      closeTerminalSession: (...args: unknown[]) =>
        closeTerminalSession(...args),
      attachTerminalSession: vi.fn(),
      detachTerminalSession: vi.fn(),
      fitTerminalSession: vi.fn(),
      focusTerminalSession: vi.fn(),
      restartTerminalSession: vi.fn(),
    };
  },
);

import { WorkbenchTerminalPanel } from "#/components/features/ide-layout/terminal/workbench-terminal-panel";
import { useTerminalSessionsStore } from "#/components/features/ide-layout/terminal/terminal-sessions";

describe("WorkbenchTerminalPanel", () => {
  beforeEach(() => {
    createTerminalSession.mockReset();
    closeTerminalSession.mockReset();
    useTerminalSessionsStore.setState({ sessions: [], activeId: null });
  });

  it("falls back to the command-runner terminal when shells aren't served", async () => {
    support = { isSupported: false, isChecking: false };
    render(<WorkbenchTerminalPanel />);
    expect(await screen.findByTestId("legacy-terminal")).toBeInTheDocument();
    expect(createTerminalSession).not.toHaveBeenCalled();
  });

  it("opens a first shell in the workspace directory", () => {
    support = { isSupported: true, isChecking: false };
    render(<WorkbenchTerminalPanel />);
    expect(createTerminalSession).toHaveBeenCalledWith({
      workspaceKey: "ws",
      url: "ws://localhost:8000/workbench/terminal",
      sessionApiKey: "conv-key",
      cwd: "/workspace/project",
    });
    expect(screen.getByTestId("terminal-tab-agent")).toBeInTheDocument();
  });

  it("lists this workspace's terminals and opens more on demand", async () => {
    support = { isSupported: true, isChecking: false };
    useTerminalSessionsStore.setState({
      sessions: [
        { id: "t1", workspaceKey: "ws", title: "Terminal 1", status: "ready" },
        {
          id: "t2",
          workspaceKey: "other",
          title: "Terminal 1",
          status: "ready",
        },
      ],
      activeId: "t1",
    });
    const user = userEvent.setup();
    render(<WorkbenchTerminalPanel />);

    expect(screen.getByTestId("terminal-tab-t1")).toBeInTheDocument();
    expect(screen.queryByTestId("terminal-tab-t2")).not.toBeInTheDocument();
    expect(createTerminalSession).not.toHaveBeenCalled();
    expect(screen.getByTestId("terminal-host-t1")).toBeInTheDocument();

    await user.click(screen.getByTestId("terminal-new"));
    expect(createTerminalSession).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Close Terminal 1" }));
    expect(closeTerminalSession).toHaveBeenCalledWith("t1");
  });
});

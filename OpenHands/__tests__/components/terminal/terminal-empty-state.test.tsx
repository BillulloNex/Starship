import { screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useCommandStore } from "#/stores/command-store";
import { useAgentState } from "#/hooks/use-agent-state";
import { AgentState } from "#/types/agent-state";

vi.mock("#/hooks/use-agent-state");

const mockTerminalInstance = {
  open: vi.fn(),
  write: vi.fn(),
  writeln: vi.fn(),
  dispose: vi.fn(),
  loadAddon: vi.fn(),
  onData: vi.fn(() => ({ dispose: vi.fn() })),
  onBinary: vi.fn(() => ({ dispose: vi.fn() })),
  onTitleChange: vi.fn(() => ({ dispose: vi.fn() })),
  onKey: vi.fn(() => ({ dispose: vi.fn() })),
  onRender: vi.fn(() => ({ dispose: vi.fn() })),
  onResize: vi.fn(() => ({ dispose: vi.fn() })),
  clear: vi.fn(),
  reset: vi.fn(),
  focus: vi.fn(),
  blur: vi.fn(),
  element: null,
  textarea: null,
  rows: 24,
  cols: 80,
  unicode: { activeVersion: "11" },
  parser: { registerOscHandler: vi.fn() },
  options: {},
};

vi.mock("@xterm/xterm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@xterm/xterm")>()),
  Terminal: vi.fn(function MockTerminal() {
    return mockTerminalInstance;
  }),
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: vi.fn(function MockFitAddon() {
    return { fit: vi.fn() };
  }),
}));

import { renderWithProviders } from "test-utils";
import Terminal from "#/components/features/terminal/terminal";

describe("Terminal empty state", () => {
  beforeEach(() => {
    useCommandStore.setState({ commands: [] });
    vi.mocked(useAgentState).mockReturnValue({
      curAgentState: AgentState.RUNNING,
    });
    global.ResizeObserver = vi.fn(function MockResizeObserver() {
      return {
        observe: vi.fn(),
        disconnect: vi.fn(),
      };
    }) as unknown as typeof ResizeObserver;
  });

  it("shows the terminal view when runtime is active", () => {
    renderWithProviders(<Terminal />);

    expect(screen.getByText("User Shell 1")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("renders active session when terminal commands exist", () => {
    useCommandStore.setState({
      commands: [{ type: "output", content: "hello" }],
    });

    renderWithProviders(<Terminal />);

    expect(screen.queryByTestId("runtime-waiting")).not.toBeInTheDocument();
  });

  it("shows the runtime waiting state when inactive", () => {
    vi.mocked(useAgentState).mockReturnValue({
      curAgentState: AgentState.LOADING,
    });

    renderWithProviders(<Terminal />);

    expect(screen.queryByText("Ready")).not.toBeInTheDocument();
    expect(screen.getByTestId("runtime-waiting")).toBeInTheDocument();
  });
});

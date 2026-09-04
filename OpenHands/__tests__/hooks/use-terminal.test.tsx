import { beforeAll, describe, expect, it, vi, afterEach } from "vitest";
import { useTerminal } from "#/hooks/use-terminal";
import { Command, useCommandStore } from "#/stores/command-store";
import { renderWithProviders } from "../../test-utils";

// Mock useActiveConversation
vi.mock("#/hooks/query/use-active-conversation", () => ({
  useActiveConversation: () => ({
    data: {
      id: "test-conversation-id",
    },
    isFetched: true,
  }),
}));

// Mock useConversationWebSocket
vi.mock("#/contexts/conversation-websocket-context", () => ({
  useConversationWebSocket: () => null,
}));

function TestTerminalComponent() {
  const { ref } = useTerminal({ isInteractive: false });
  return <div ref={ref} />;
}

function InteractiveTerminalComponent({
  onExecuteCommand,
}: {
  onExecuteCommand: (command: string) => void;
}) {
  const { ref } = useTerminal({ isInteractive: true, onExecuteCommand });
  return <div ref={ref} />;
}

describe("useTerminal", () => {
  // Terminal tests
  const mockTerminal = vi.hoisted(() => ({
    loadAddon: vi.fn(),
    open: vi.fn(),
    write: vi.fn(),
    writeln: vi.fn(),
    clear: vi.fn(),
    dispose: vi.fn(),
    onData: vi.fn((_callback: (data: string) => void) => ({
      dispose: vi.fn(),
    })),
    element: document.createElement("div"),
  }));

  const mockFitAddon = vi.hoisted(() => ({
    fit: vi.fn(),
  }));

  beforeAll(() => {
    // mock ResizeObserver - use class for Vitest 4 constructor support
    window.ResizeObserver = class {
      observe = vi.fn();

      unobserve = vi.fn();

      disconnect = vi.fn();
    } as unknown as typeof ResizeObserver;

    // mock Terminal - use class for Vitest 4 constructor support
    vi.mock("@xterm/xterm", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@xterm/xterm")>()),
      Terminal: class {
        loadAddon = mockTerminal.loadAddon;

        open = mockTerminal.open;

        write = mockTerminal.write;

        writeln = mockTerminal.writeln;

        clear = mockTerminal.clear;

        dispose = mockTerminal.dispose;

        onData = mockTerminal.onData;

        element = mockTerminal.element;
      },
    }));

    // mock FitAddon
    vi.mock("@xterm/addon-fit", () => ({
      FitAddon: class {
        fit = mockFitAddon.fit;
      },
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
    // Reset command store between tests
    useCommandStore.setState({
      sessions: [
        {
          id: "agent",
          name: "Agent Output",
          isAgentOnly: true,
          commands: [],
          isExecuting: false,
        },
        {
          id: "shell-1",
          name: "User Shell 1",
          isAgentOnly: false,
          commands: [],
          isExecuting: false,
        },
      ],
      activeSessionId: "shell-1",
    });
  });

  it("should render", () => {
    renderWithProviders(<TestTerminalComponent />);
  });

  it("should render the commands in the terminal", () => {
    const commands: Command[] = [
      { content: "echo hello", type: "input" },
      { content: "hello", type: "output" },
    ];

    // Set commands in store before rendering to ensure they're picked up during initialization
    useCommandStore.setState({
      sessions: [
        {
          id: "agent",
          name: "Agent Output",
          isAgentOnly: true,
          commands: [],
          isExecuting: false,
        },
        {
          id: "shell-1",
          name: "User Shell 1",
          isAgentOnly: false,
          commands,
          isExecuting: false,
        },
      ],
      activeSessionId: "shell-1",
      commands,
    });

    renderWithProviders(<TestTerminalComponent />);

    expect(mockTerminal.writeln).toHaveBeenNthCalledWith(1, "echo hello");
    expect(mockTerminal.writeln).toHaveBeenNthCalledWith(2, "hello");
  });

  it("should not call fit() when terminal.element is null", () => {
    // Temporarily set element to null to simulate terminal not being opened
    const originalElement = mockTerminal.element;
    mockTerminal.element = null as unknown as HTMLDivElement;

    renderWithProviders(<TestTerminalComponent />);

    // fit() should not be called because terminal.element is null
    expect(mockFitAddon.fit).not.toHaveBeenCalled();

    // Restore original element
    mockTerminal.element = originalElement;
  });

  it("should accept pasted text and execute it on Enter", () => {
    const onExecuteCommand = vi.fn();
    renderWithProviders(
      <InteractiveTerminalComponent onExecuteCommand={onExecuteCommand} />,
    );
    const onData = mockTerminal.onData.mock.calls[0][0];

    onData("echo paste-test");
    expect(mockTerminal.write).toHaveBeenLastCalledWith("echo paste-test");

    onData("\r");
    expect(onExecuteCommand).toHaveBeenCalledWith("echo paste-test");
  });

  it("should keep typed input and Backspace behavior after pasted text", () => {
    const onExecuteCommand = vi.fn();
    renderWithProviders(
      <InteractiveTerminalComponent onExecuteCommand={onExecuteCommand} />,
    );
    const onData = mockTerminal.onData.mock.calls[0][0];

    onData("echo paste-tesx");
    onData("\x7f");
    onData("t");
    onData("\r");

    expect(mockTerminal.write).toHaveBeenCalledWith("\b \b");
    expect(onExecuteCommand).toHaveBeenCalledWith("echo paste-test");
  });

  it("should remain non-interactive for Agent Output", () => {
    renderWithProviders(<TestTerminalComponent />);

    expect(mockTerminal.onData).not.toHaveBeenCalled();
  });
});

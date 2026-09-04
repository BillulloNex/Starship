import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import React from "react";
import { Command, useCommandStore } from "#/stores/command-store";
import { parseTerminalOutput } from "#/utils/parse-terminal-output";

/*
  NOTE: Tests for this hook are indirectly covered by the tests for the XTermTerminal component.
  The reason for this is that the hook exposes a ref that requires a DOM element to be rendered.
*/

const renderCommand = (
  command: Command,
  terminal: Terminal,
  isUserInput: boolean = false,
) => {
  const { content, type, source } = command;

  // Skip rendering user input commands that come from local user typing
  // as they've already been displayed on the screen as the user typed
  if (type === "input" && (source === "user" || isUserInput)) {
    return;
  }

  const trimmedContent = (content || "").replaceAll("\n", "\r\n").trim();
  // Only write if there's actual content to avoid empty newlines
  if (trimmedContent) {
    terminal.writeln(parseTerminalOutput(trimmedContent));
  }
};

/**
 * Check if the terminal is ready for fit operations.
 * This prevents the "Cannot read properties of undefined (reading 'dimensions')" error
 * that occurs when fit() is called on a terminal that is hidden, disposed, or not fully initialized.
 */
const canFitTerminal = (
  terminalInstance: Terminal | null,
  fitAddonInstance: FitAddon | null,
  containerElement: HTMLDivElement | null,
): boolean => {
  // Check terminal and fitAddon exist
  if (!terminalInstance || !fitAddonInstance) {
    return false;
  }

  // Check container element exists
  if (!containerElement) {
    return false;
  }

  // Check element is visible (not display: none)
  // When display is none, offsetParent is null (except for fixed/body elements)
  const computedStyle = window.getComputedStyle(containerElement);
  if (computedStyle.display === "none") {
    return false;
  }

  // Check element has dimensions
  const { clientWidth, clientHeight } = containerElement;
  if (clientWidth === 0 || clientHeight === 0) {
    return false;
  }

  // Check terminal has been opened (element property is set after open())
  if (!terminalInstance.element) {
    return false;
  }

  return true;
};

function resolveTerminalForeground(host: HTMLElement): string {
  const probe = host.ownerDocument.createElement("span");
  probe.style.color = "var(--oh-surface-foreground)";
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  host.appendChild(probe);
  const fromVar = getComputedStyle(probe).color;
  probe.remove();
  if (fromVar && fromVar !== "rgba(0, 0, 0, 0)") {
    return fromVar;
  }
  return getComputedStyle(host).color;
}

// Create a persistent reference that survives component unmounts
// This ensures terminal history is preserved when navigating away and back
const persistentLastCommandIndex = { current: 0 };

export interface UseTerminalOptions {
  onExecuteCommand?: (command: string) => void;
  isInteractive?: boolean;
  commands?: Command[];
}

export const useTerminal = (options: UseTerminalOptions = {}) => {
  const {
    onExecuteCommand,
    isInteractive = true,
    commands: optionsCommands,
  } = options;
  const storeCommands = useCommandStore((state) => state.commands);
  const commands = optionsCommands ?? storeCommands;
  const terminal = React.useRef<Terminal | null>(null);
  const fitAddon = React.useRef<FitAddon | null>(null);
  const ref = React.useRef<HTMLDivElement>(null);
  const lastCommandIndex = React.useRef(0);
  const isDisposed = React.useRef(false);
  const currentLineRef = React.useRef("");
  const onExecuteRef = React.useRef(onExecuteCommand);

  React.useEffect(() => {
    onExecuteRef.current = onExecuteCommand;
  }, [onExecuteCommand]);

  const createTerminal = (host: HTMLDivElement) =>
    new Terminal({
      fontFamily: "Menlo, Monaco, 'Courier New', monospace",
      fontSize: 14,
      scrollback: 10000,
      scrollSensitivity: 1,
      fastScrollSensitivity: 5,
      disableStdin: !isInteractive,
      cursorBlink: isInteractive,
      allowTransparency: true,
      theme: {
        background: "rgba(0, 0, 0, 0)",
        foreground: resolveTerminalForeground(host),
      },
    });

  const fitTerminalSafely = React.useCallback(() => {
    if (isDisposed.current) {
      return;
    }
    if (canFitTerminal(terminal.current, fitAddon.current, ref.current)) {
      fitAddon.current!.fit();
    }
  }, []);

  const initializeTerminal = () => {
    if (terminal.current) {
      if (fitAddon.current) terminal.current.loadAddon(fitAddon.current);
      if (ref.current) {
        terminal.current.open(ref.current);
        if (isInteractive) {
          // Show cursor for interactive terminal
          terminal.current.write("\x1b[?25h");
        } else {
          // Hide cursor for read-only terminal
          terminal.current.write("\x1b[?25l");
        }
        fitTerminalSafely();
      }
    }
  };

  // Initialize terminal and handle cleanup
  React.useEffect(() => {
    isDisposed.current = false;
    const host = ref.current;
    if (!host) {
      return undefined;
    }

    terminal.current = createTerminal(host);
    fitAddon.current = new FitAddon();

    if (ref.current) {
      initializeTerminal();
      // Render all commands in array
      if (commands.length > 0) {
        for (let i = 0; i < commands.length; i += 1) {
          if (commands[i].type === "input" && commands[i].source !== "user") {
            terminal.current.write("$ ");
            renderCommand(commands[i], terminal.current, false);
          } else if (commands[i].type === "output") {
            renderCommand(commands[i], terminal.current, false);
          }
        }
        lastCommandIndex.current = commands.length;
      }

      if (isInteractive) {
        // Write fresh prompt if ending on output
        const lastCmd = commands[commands.length - 1];
        if (!lastCmd || lastCmd.type === "output") {
          terminal.current.write("$ ");
        }

        // Attach interactive data listener
        const dataDisposable = terminal.current.onData((data) => {
          if (!terminal.current) return;

          // Enter key
          if (data === "\r" || data === "\n") {
            terminal.current.write("\r\n");
            const cmd = currentLineRef.current.trim();
            currentLineRef.current = "";

            if (cmd) {
              useCommandStore.getState().appendInput(cmd, "user");
              if (onExecuteRef.current) {
                onExecuteRef.current(cmd);
              }
            } else {
              terminal.current.write("$ ");
            }
          }
          // Backspace
          else if (data === "\x7f" || data === "\b") {
            if (currentLineRef.current.length > 0) {
              currentLineRef.current = currentLineRef.current.slice(0, -1);
              terminal.current.write("\b \b");
            }
          }
          // Ctrl+C
          else if (data === "\x03") {
            currentLineRef.current = "";
            terminal.current.write("^C\r\n$ ");
          }
          // Ctrl+L (Clear screen)
          else if (data === "\x0c") {
            terminal.current.clear();
            terminal.current.write("$ " + currentLineRef.current);
          }
          // Printable typed or pasted text. Xterm sends paste events as a
          // single onData call containing the full clipboard value.
          else if (
            data.length > 0 &&
            Array.from(data).every((character) => character.charCodeAt(0) >= 32)
          ) {
            currentLineRef.current += data;
            terminal.current.write(data);
          }
        });

        return () => {
          dataDisposable.dispose();
          isDisposed.current = true;
          terminal.current?.dispose();
          lastCommandIndex.current = 0;
        };
      }
    }

    return () => {
      isDisposed.current = true;
      terminal.current?.dispose();
      lastCommandIndex.current = 0;
    };
  }, []);

  React.useEffect(() => {
    if (!terminal.current) return;

    if (lastCommandIndex.current > commands.length) {
      terminal.current.clear?.();
      lastCommandIndex.current = 0;
    }

    if (commands.length > 0 && lastCommandIndex.current < commands.length) {
      for (let i = lastCommandIndex.current; i < commands.length; i += 1) {
        if (commands[i].type === "input" && commands[i].source !== "user") {
          terminal.current.write("$ ");
          renderCommand(commands[i], terminal.current, false);
        } else if (commands[i].type === "output") {
          renderCommand(commands[i], terminal.current, false);
        }
      }
      lastCommandIndex.current = commands.length;

      // Add a fresh prompt after rendering new output in interactive mode
      if (isInteractive) {
        const lastCmd = commands[commands.length - 1];
        if (lastCmd && lastCmd.type === "output") {
          terminal.current.write("$ ");
        }
      }
    }
  }, [commands, isInteractive]);

  React.useEffect(() => {
    let resizeObserver: ResizeObserver | null = null;

    resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        fitTerminalSafely();
      });
    });

    if (ref.current) {
      resizeObserver.observe(ref.current);
    }

    return () => {
      resizeObserver?.disconnect();
    };
  }, [fitTerminalSafely]);

  return { ref, terminalRef: terminal };
};

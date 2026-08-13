import React from "react";
import { Trash2, Terminal as TerminalIcon, CircleDot } from "lucide-react";
import { useTerminal } from "#/hooks/use-terminal";
import "@xterm/xterm/css/xterm.css";
import { RUNTIME_INACTIVE_STATES } from "#/types/agent-state";
import { cn } from "#/utils/utils";
import { WaitingForRuntimeMessage } from "../chat/waiting-for-runtime-message";
import { useAgentState } from "#/hooks/use-agent-state";
import { useCommandStore } from "#/stores/command-store";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useBashCommandRunner } from "#/hooks/use-bash-command-runner";

function Terminal() {
  const { curAgentState } = useAgentState();
  const commands = useCommandStore((state) => state.commands);
  const isExecuting = useCommandStore((state) => state.isExecuting);
  const clearTerminal = useCommandStore((state) => state.clearTerminal);

  const { data: conversation } = useActiveConversation();
  const conversationUrl = conversation?.conversation_url;
  const sessionApiKey = conversation?.session_api_key;
  const workingDir =
    conversation?.workspace?.working_dir?.trim() || "/root/workspace";

  const isRuntimeInactive = RUNTIME_INACTIVE_STATES.includes(curAgentState);

  const runBashCommand = useBashCommandRunner(
    conversationUrl,
    sessionApiKey,
    !isRuntimeInactive && !!conversationUrl,
  );

  const activeTerminalRef = React.useRef<Terminal | null>(null);

  const handleExecuteCommand = React.useCallback(
    async (command: string) => {
      const trimmed = command.trim();
      if (!trimmed) return;

      // Intercept clear / cls to clear the XTerm screen locally
      if (trimmed === "clear" || trimmed === "cls") {
        clearTerminal();
        activeTerminalRef.current?.clear();
        activeTerminalRef.current?.write("$ ");
        return;
      }

      useCommandStore.getState().setIsExecuting(true);
      try {
        const execCommand = `export TERM=xterm-256color; ${trimmed}`;
        const result = await runBashCommand(execCommand, workingDir, 60);
        const outputParts = [];
        if (result.stdout) outputParts.push(result.stdout);
        if (result.stderr) outputParts.push(result.stderr);
        const combined = outputParts.join("");
        useCommandStore
          .getState()
          .appendOutput(
            combined ||
              (result.exit_code === 0
                ? ""
                : `[Process exited with code ${result.exit_code}]`),
          );
      } catch (err) {
        useCommandStore
          .getState()
          .appendOutput(
            `\r\nError executing command: ${err instanceof Error ? err.message : String(err)}\r\n`,
          );
      } finally {
        useCommandStore.getState().setIsExecuting(false);
      }
    },
    [clearTerminal, runBashCommand, workingDir],
  );

  const { ref, terminalRef } = useTerminal({
    onExecuteCommand: handleExecuteCommand,
    isInteractive: !isRuntimeInactive,
  });

  activeTerminalRef.current = terminalRef.current;

  const handleClear = () => {
    clearTerminal();
    terminalRef.current?.clear();
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-[var(--oh-bg-workspace)]">
      {/* Terminal Toolbar */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-[var(--oh-border)] bg-[var(--oh-surface)] px-4">
        <div className="flex items-center gap-2 text-xs font-medium text-[var(--oh-foreground)]">
          <TerminalIcon className="h-4 w-4 text-[var(--oh-accent)]" />
          <span>Interactive Terminal</span>
          <div className="flex items-center gap-1.5 rounded-full bg-[var(--oh-surface-subtle)] px-2 py-0.5 text-[10px] text-[var(--oh-muted)]">
            <CircleDot
              className={cn(
                "h-2 w-2",
                isExecuting
                  ? "animate-pulse text-amber-500"
                  : isRuntimeInactive
                    ? "text-red-500"
                    : "text-emerald-500",
              )}
            />
            <span>
              {isRuntimeInactive
                ? "Inactive"
                : isExecuting
                  ? "Executing..."
                  : "Ready"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleClear}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--oh-muted)] hover:bg-[var(--oh-surface-hover)] hover:text-[var(--oh-foreground)] transition-colors"
            title="Clear terminal output (Ctrl+L)"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {isRuntimeInactive && <WaitingForRuntimeMessage className="pt-16" />}

      <div
        className={cn(
          "flex-1 min-h-0 p-4",
          isRuntimeInactive &&
            "pointer-events-none absolute inset-0 h-0 w-0 overflow-hidden p-0 opacity-0",
        )}
      >
        <div ref={ref} className="h-full w-full" />
      </div>
    </div>
  );
}

export default Terminal;



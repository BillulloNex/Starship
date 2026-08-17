import React from "react";
import { Plus, X, Trash2, CircleDot, Bot, SquareTerminal } from "lucide-react";
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
  const sessions = useCommandStore((state) => state.sessions);
  const activeSessionId = useCommandStore((state) => state.activeSessionId);
  const setActiveSessionId = useCommandStore(
    (state) => state.setActiveSessionId,
  );
  const createSession = useCommandStore((state) => state.createSession);
  const closeSession = useCommandStore((state) => state.closeSession);
  const clearTerminal = useCommandStore((state) => state.clearTerminal);

  const activeSession =
    sessions.find((s) => s.id === activeSessionId) || sessions[0];
  const isAgentSession = activeSession?.isAgentOnly ?? false;
  const commands = activeSession?.commands || [];
  const isExecuting = activeSession?.isExecuting || false;

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

  const activeTerminalRef = React.useRef<{
    clear: () => void;
    write: (data: string) => void;
  } | null>(null);

  const handleExecuteCommand = React.useCallback(
    async (command: string) => {
      const trimmed = command.trim();
      if (!trimmed) return;

      const currentSessionId = useCommandStore.getState().activeSessionId;
      const currentSession = useCommandStore
        .getState()
        .sessions.find((s) => s.id === currentSessionId);
      const currentCwd = currentSession?.cwd || workingDir;

      // Intercept clear / cls to clear the XTerm screen locally
      if (trimmed === "clear" || trimmed === "cls") {
        clearTerminal(currentSessionId);
        activeTerminalRef.current?.clear();
        activeTerminalRef.current?.write("$ ");
        return;
      }

      useCommandStore.getState().setIsExecuting(true, currentSessionId);
      try {
        const firstWord = trimmed.split(/\s+/)[0];
        const isCd = firstWord === "cd";
        const ttyCommands = [
          "htop",
          "top",
          "vim",
          "vi",
          "nano",
          "less",
          "more",
          "man",
        ];

        let execCommand = isCd
          ? `export TERM=xterm-256color; ${trimmed} && pwd`
          : `export TERM=xterm-256color; ${trimmed}`;

        if (ttyCommands.includes(firstWord)) {
          execCommand = `export TERM=xterm-256color; python3 -c "import pty, sys; pty.spawn(sys.argv[1:])" ${trimmed}`;
        }

        const result = await runBashCommand(execCommand, currentCwd, 60);

        if (isCd && result.exit_code === 0 && result.stdout) {
          const lines = result.stdout.trim().split("\n");
          const newPwd = lines[lines.length - 1]?.trim();
          if (newPwd && newPwd.startsWith("/")) {
            useCommandStore.getState().setSessionCwd(newPwd, currentSessionId);
          }
        }

        const outputParts = [];
        if (result.stdout && !isCd) outputParts.push(result.stdout);
        if (result.stderr) outputParts.push(result.stderr);
        const combined = outputParts.join("");
        useCommandStore
          .getState()
          .appendOutput(
            combined ||
              (result.exit_code === 0
                ? ""
                : `[Process exited with code ${result.exit_code}]`),
            currentSessionId,
          );
      } catch (err) {
        useCommandStore
          .getState()
          .appendOutput(
            `\r\nError executing command: ${err instanceof Error ? err.message : String(err)}\r\n`,
            currentSessionId,
          );
      } finally {
        useCommandStore.getState().setIsExecuting(false, currentSessionId);
      }
    },
    [clearTerminal, runBashCommand, workingDir],
  );

  const { ref, terminalRef } = useTerminal({
    onExecuteCommand: handleExecuteCommand,
    isInteractive: !isRuntimeInactive && !isAgentSession,
    commands,
  });

  activeTerminalRef.current = terminalRef.current;

  const handleClear = () => {
    clearTerminal(activeSessionId);
    terminalRef.current?.clear();
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-[var(--oh-bg-workspace)]">
      {/* Terminal Multi-Tab Header */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-[var(--oh-border)] bg-[var(--oh-surface)] px-2">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
          {sessions.map((session) => {
            const isActive = session.id === activeSessionId;
            return (
              <div
                key={session.id}
                onClick={() => setActiveSessionId(session.id)}
                className={cn(
                  "group relative flex items-center gap-1.5 rounded-t px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors border-b-2",
                  isActive
                    ? "bg-[var(--oh-bg-workspace)] text-[var(--oh-foreground)] border-[var(--oh-accent)]"
                    : "text-[var(--oh-muted)] hover:bg-[var(--oh-surface-hover)] hover:text-[var(--oh-foreground)] border-transparent",
                )}
              >
                {session.isAgentOnly ? (
                  <Bot className="h-3.5 w-3.5 text-indigo-400" />
                ) : (
                  <SquareTerminal className="h-3.5 w-3.5 text-[var(--oh-accent)]" />
                )}
                <span>{session.name}</span>
                {session.isExecuting && (
                  <CircleDot className="h-2 w-2 animate-pulse text-amber-500 ml-0.5" />
                )}
                {!session.isAgentOnly && sessions.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeSession(session.id);
                    }}
                    className="ml-1 rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-[var(--oh-surface-hover)] hover:text-red-400 transition-all"
                    title="Close Terminal"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => createSession()}
            className="flex items-center justify-center rounded p-1.5 text-[var(--oh-muted)] hover:bg-[var(--oh-surface-hover)] hover:text-[var(--oh-foreground)] transition-colors ml-1"
            title="New Terminal Tab"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-2 pr-2">
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
                  : isAgentSession
                    ? "Read-only"
                    : "Ready"}
            </span>
          </div>

          <button
            type="button"
            onClick={handleClear}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--oh-muted)] hover:bg-[var(--oh-surface-hover)] hover:text-[var(--oh-foreground)] transition-colors"
            title="Clear terminal output"
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

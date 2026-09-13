/* eslint-disable i18next/no-literal-string */
import React, { lazy, useEffect, useMemo, useRef } from "react";
import { Bot, Plus, RotateCw, SquareTerminal, X } from "lucide-react";
import "@xterm/xterm/css/xterm.css";
import { useWorkspaceRuntime } from "#/context/workspace-runtime-context";
import { getAgentServerClientOptions } from "#/api/agent-server-client-options";
import { useTerminal } from "#/hooks/use-terminal";
import { useCommandStore } from "#/stores/command-store";
import { buildWorkbenchTerminalWebSocketUrl } from "#/utils/websocket-url";
import { cn } from "#/utils/utils";
import { LazyPanel } from "../panels/lazy-panel";
import {
  attachTerminalSession,
  closeTerminalSession,
  createTerminalSession,
  detachTerminalSession,
  fitTerminalSession,
  focusTerminalSession,
  restartTerminalSession,
  useTerminalSessionsStore,
  type TerminalSessionInfo,
} from "./terminal-sessions";
import { useWorkbenchTerminalSupport } from "./use-workbench-terminal-support";

const LegacyTerminal = lazy(
  () => import("#/components/features/terminal/terminal"),
);

const AGENT_TAB_ID = "agent";

function AgentOutputView() {
  const commands = useCommandStore(
    (s) => s.sessions.find((session) => session.isAgentOnly)?.commands,
  );
  const { ref } = useTerminal({
    isInteractive: false,
    commands: commands ?? [],
  });
  return (
    <div className="h-full w-full px-3 py-2" data-testid="agent-output-view">
      <div ref={ref} className="h-full w-full" />
    </div>
  );
}

function TerminalHost({ session }: { session: TerminalSessionInfo }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    attachTerminalSession(session.id, host);
    focusTerminalSession(session.id);

    const observer = new ResizeObserver(() =>
      requestAnimationFrame(() => fitTerminalSession(session.id)),
    );
    observer.observe(host);
    return () => {
      observer.disconnect();
      detachTerminalSession(session.id);
    };
  }, [session.id]);

  const canRestart =
    session.status === "exited" || session.status === "disconnected";

  return (
    <div className="relative h-full w-full">
      <div
        ref={hostRef}
        className="h-full w-full px-2 py-1"
        data-testid={`terminal-host-${session.id}`}
      />
      {canRestart && (
        <button
          type="button"
          onClick={() => {
            restartTerminalSession(session.id);
            focusTerminalSession(session.id);
          }}
          className="absolute right-3 top-2 flex items-center gap-1 rounded border border-[var(--oh-border)] bg-[var(--oh-surface)] px-2 py-1 text-xs text-white hover:bg-[var(--oh-interactive-hover)]"
        >
          <RotateCw className="h-3 w-3" />
          Restart
        </button>
      )}
    </div>
  );
}

function statusDotClass(session: TerminalSessionInfo) {
  if (session.status === "ready") return "bg-emerald-500";
  if (session.status === "connecting") return "bg-amber-400 animate-pulse";
  return "bg-[var(--oh-muted)]";
}

function InteractiveTerminals() {
  const { conversationUrl, sessionApiKey, workingDir, workspaceKey } =
    useWorkspaceRuntime();
  const allSessions = useTerminalSessionsStore((s) => s.sessions);
  const activeId = useTerminalSessionsStore((s) => s.activeId);
  const setActiveId = useTerminalSessionsStore((s) => s.setActiveId);

  const sessions = useMemo(
    () => allSessions.filter((s) => s.workspaceKey === workspaceKey),
    [allSessions, workspaceKey],
  );

  const openTerminal = React.useCallback(() => {
    if (!workspaceKey) return;
    const { apiKey } = getAgentServerClientOptions({
      conversationUrl,
      sessionApiKey,
    });
    createTerminalSession({
      workspaceKey,
      url: buildWorkbenchTerminalWebSocketUrl(conversationUrl),
      sessionApiKey: apiKey ?? null,
      cwd: workingDir,
    });
  }, [conversationUrl, sessionApiKey, workingDir, workspaceKey]);

  // Open a first terminal for a workspace, like a fresh VS Code window.
  const openedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!workspaceKey || openedFor.current === workspaceKey) return;
    openedFor.current = workspaceKey;
    if (sessions.length === 0) openTerminal();
  }, [workspaceKey, sessions.length, openTerminal]);

  const visibleId =
    activeId === AGENT_TAB_ID || sessions.some((s) => s.id === activeId)
      ? activeId
      : (sessions[0]?.id ?? AGENT_TAB_ID);
  const activeSession = sessions.find((s) => s.id === visibleId);

  return (
    <div
      className="flex h-full w-full flex-col bg-[#141414]"
      data-testid="workbench-terminal-panel"
    >
      <div className="flex h-8 shrink-0 items-center gap-0.5 border-b border-[var(--oh-border-subtle)] px-1.5">
        <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveId(AGENT_TAB_ID)}
            data-testid="terminal-tab-agent"
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded px-2 py-1 text-xs",
              visibleId === AGENT_TAB_ID
                ? "bg-[var(--oh-interactive-hover)] text-white"
                : "text-[var(--oh-muted)] hover:text-white",
            )}
          >
            <Bot className="h-3.5 w-3.5 text-indigo-400" />
            Agent
          </button>
          {sessions.map((session) => (
            <div
              key={session.id}
              className={cn(
                "group flex shrink-0 items-center rounded text-xs",
                visibleId === session.id
                  ? "bg-[var(--oh-interactive-hover)] text-white"
                  : "text-[var(--oh-muted)] hover:text-white",
              )}
            >
              <button
                type="button"
                onClick={() => setActiveId(session.id)}
                data-testid={`terminal-tab-${session.id}`}
                className="flex items-center gap-1.5 py-1 pl-2 pr-1"
              >
                <SquareTerminal className="h-3.5 w-3.5" />
                {session.title}
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    statusDotClass(session),
                  )}
                />
              </button>
              <button
                type="button"
                aria-label={`Close ${session.title}`}
                onClick={() => closeTerminalSession(session.id)}
                className="mr-1 rounded p-0.5 opacity-0 hover:bg-white/10 group-hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          aria-label="New terminal"
          title="New terminal"
          onClick={openTerminal}
          data-testid="terminal-new"
          className="ml-0.5 shrink-0 rounded p-1 text-[var(--oh-muted)] hover:bg-[var(--oh-interactive-hover)] hover:text-white"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1">
        {visibleId === AGENT_TAB_ID || !activeSession ? (
          <AgentOutputView />
        ) : (
          <TerminalHost key={activeSession.id} session={activeSession} />
        )}
      </div>
    </div>
  );
}

/**
 * The IDE's terminal panel: real shells when the backend supports them, the
 * command-runner terminal otherwise.
 */
export function WorkbenchTerminalPanel() {
  const { isSupported, isChecking } = useWorkbenchTerminalSupport();

  if (isChecking) return <div className="h-full w-full bg-[#141414]" />;
  if (!isSupported) {
    return (
      <LazyPanel>
        <LegacyTerminal />
      </LazyPanel>
    );
  }
  return <InteractiveTerminals />;
}

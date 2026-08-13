import { create } from "zustand";

export type Command = {
  content: string;
  type: "input" | "output";
  source?: "user" | "agent";
};

export interface TerminalSession {
  id: string;
  name: string;
  isAgentOnly?: boolean;
  commands: Command[];
  isExecuting: boolean;
}

const DEFAULT_SESSIONS: TerminalSession[] = [
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
];

interface CommandState {
  sessions: TerminalSession[];
  activeSessionId: string;
  // Legacy getter for active session commands
  commands: Command[];
  isExecuting: boolean;
  createSession: (name?: string) => string;
  closeSession: (id: string) => void;
  setActiveSessionId: (id: string) => void;
  appendInput: (
    content: string,
    source?: "user" | "agent",
    sessionId?: string,
  ) => void;
  appendOutput: (content: string, sessionId?: string) => void;
  setIsExecuting: (isExecuting: boolean, sessionId?: string) => void;
  clearTerminal: (sessionId?: string) => void;
}

export const useCommandStore = create<CommandState>((set, get) => ({
  sessions: DEFAULT_SESSIONS,
  activeSessionId: "shell-1",
  commands: [],
  isExecuting: false,

  createSession: (name?: string) => {
    const state = get();
    const userSessions = state.sessions.filter((s) => !s.isAgentOnly);
    const nextNum = userSessions.length + 1;
    const id = `shell-${Date.now()}`;
    const sessionName = name || `User Shell ${nextNum}`;
    const newSession: TerminalSession = {
      id,
      name: sessionName,
      isAgentOnly: false,
      commands: [],
      isExecuting: false,
    };
    const nextSessions = [...state.sessions, newSession];
    const active = newSession;
    set({
      sessions: nextSessions,
      activeSessionId: id,
      commands: active.commands,
      isExecuting: active.isExecuting,
    });
    return id;
  },

  closeSession: (id: string) => {
    const state = get();
    const sessionToClose = state.sessions.find((s) => s.id === id);
    if (!sessionToClose || sessionToClose.isAgentOnly) {
      return; // Cannot close agent output session
    }
    const remaining = state.sessions.filter((s) => s.id !== id);
    let nextActiveId = state.activeSessionId;
    if (state.activeSessionId === id) {
      nextActiveId = remaining[remaining.length - 1]?.id || "agent";
    }
    const active = remaining.find((s) => s.id === nextActiveId);
    set({
      sessions: remaining,
      activeSessionId: nextActiveId,
      commands: active ? active.commands : [],
      isExecuting: active ? active.isExecuting : false,
    });
  },

  setActiveSessionId: (id: string) => {
    const state = get();
    const active = state.sessions.find((s) => s.id === id);
    if (active) {
      set({
        activeSessionId: id,
        commands: active.commands,
        isExecuting: active.isExecuting,
      });
    }
  },

  appendInput: (
    content: string,
    source: "user" | "agent" = "agent",
    sessionId?: string,
  ) =>
    set((state) => {
      const targetId = sessionId || state.activeSessionId;
      const nextSessions = state.sessions.map((s) =>
        s.id === targetId
          ? {
              ...s,
              commands: [...s.commands, { content, type: "input" as const, source }],
            }
          : s,
      );
      const active = nextSessions.find((s) => s.id === state.activeSessionId);
      return {
        sessions: nextSessions,
        commands: active ? active.commands : [],
        isExecuting: active ? active.isExecuting : false,
      };
    }),

  appendOutput: (content: string, sessionId?: string) =>
    set((state) => {
      // Default agent outputs go to 'agent' session, user session outputs go to target
      const targetId = sessionId || "agent";
      const nextSessions = state.sessions.map((s) =>
        s.id === targetId
          ? {
              ...s,
              isExecuting: false,
              commands: [...s.commands, { content, type: "output" as const }],
            }
          : s,
      );
      const active = nextSessions.find((s) => s.id === state.activeSessionId);
      return {
        sessions: nextSessions,
        commands: active ? active.commands : [],
        isExecuting: active ? active.isExecuting : false,
      };
    }),

  setIsExecuting: (isExecuting: boolean, sessionId?: string) =>
    set((state) => {
      const targetId = sessionId || state.activeSessionId;
      const nextSessions = state.sessions.map((s) =>
        s.id === targetId ? { ...s, isExecuting } : s,
      );
      const active = nextSessions.find((s) => s.id === state.activeSessionId);
      return {
        sessions: nextSessions,
        commands: active ? active.commands : [],
        isExecuting: active ? active.isExecuting : false,
      };
    }),

  clearTerminal: (sessionId?: string) =>
    set((state) => {
      const targetId = sessionId || state.activeSessionId;
      const nextSessions = state.sessions.map((s) =>
        s.id === targetId ? { ...s, commands: [] } : s,
      );
      const active = nextSessions.find((s) => s.id === state.activeSessionId);
      return {
        sessions: nextSessions,
        commands: active ? active.commands : [],
        isExecuting: active ? active.isExecuting : false,
      };
    }),
}));



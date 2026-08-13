import { create } from "zustand";

export type Command = {
  content: string;
  type: "input" | "output";
  source?: "user" | "agent";
};

interface CommandState {
  commands: Command[];
  isExecuting: boolean;
  appendInput: (content: string, source?: "user" | "agent") => void;
  appendOutput: (content: string) => void;
  setIsExecuting: (isExecuting: boolean) => void;
  clearTerminal: () => void;
}

export const useCommandStore = create<CommandState>((set) => ({
  commands: [],
  isExecuting: false,
  appendInput: (content: string, source: "user" | "agent" = "agent") =>
    set((state) => ({
      commands: [...state.commands, { content, type: "input", source }],
    })),
  appendOutput: (content: string) =>
    set((state) => ({
      commands: [...state.commands, { content, type: "output" }],
      isExecuting: false,
    })),
  setIsExecuting: (isExecuting: boolean) => set({ isExecuting }),
  clearTerminal: () => set({ commands: [] }),
}));


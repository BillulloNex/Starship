import { create } from "zustand";
import type { DockviewApi } from "dockview-react";
import type { editor } from "monaco-editor";

export type QuickOpenMode = "files" | "commands" | "line";

export interface ActiveModelInfo {
  language: string;
  tabSize: number;
  insertSpaces: boolean;
  eol: "LF" | "CRLF";
}

interface WorkbenchState {
  /** Live dockview API while the IDE layout is mounted. */
  api: DockviewApi | null;
  /** Ids of the panels currently present in the layout. */
  openPanels: string[];
  /** The single Monaco editor instance while it is mounted. */
  editor: editor.IStandaloneCodeEditor | null;
  activeModelInfo: ActiveModelInfo | null;
  /** Paths whose buffer diverged from disk while they had unsaved edits. */
  conflicts: Record<string, true>;
  /** Paths with a save in flight. */
  savingPaths: Record<string, true>;
  quickOpen: { isOpen: boolean; query: string };
}

interface WorkbenchActions {
  setApi: (api: DockviewApi | null) => void;
  setOpenPanels: (ids: string[]) => void;
  setEditor: (editor: editor.IStandaloneCodeEditor | null) => void;
  setActiveModelInfo: (info: ActiveModelInfo | null) => void;
  setConflict: (path: string, hasConflict: boolean) => void;
  setSaving: (path: string, isSaving: boolean) => void;
  openQuickOpen: (mode?: QuickOpenMode) => void;
  setQuickOpenQuery: (query: string) => void;
  closeQuickOpen: () => void;
}

const QUICK_OPEN_PREFIX: Record<QuickOpenMode, string> = {
  files: "",
  commands: ">",
  line: ":",
};

function withFlag(
  record: Record<string, true>,
  key: string,
  on: boolean,
): Record<string, true> {
  if (on === !!record[key]) return record;
  const next = { ...record };
  if (on) next[key] = true;
  else delete next[key];
  return next;
}

export const useWorkbenchStore = create<WorkbenchState & WorkbenchActions>()(
  (set) => ({
    api: null,
    openPanels: [],
    editor: null,
    activeModelInfo: null,
    conflicts: {},
    savingPaths: {},
    quickOpen: { isOpen: false, query: "" },

    setApi: (api) => set({ api }),
    setOpenPanels: (openPanels) => set({ openPanels }),
    setEditor: (editorInstance) => set({ editor: editorInstance }),
    setActiveModelInfo: (activeModelInfo) => set({ activeModelInfo }),
    setConflict: (path, hasConflict) =>
      set((state) => ({
        conflicts: withFlag(state.conflicts, path, hasConflict),
      })),
    setSaving: (path, isSaving) =>
      set((state) => ({
        savingPaths: withFlag(state.savingPaths, path, isSaving),
      })),
    openQuickOpen: (mode = "files") =>
      set({ quickOpen: { isOpen: true, query: QUICK_OPEN_PREFIX[mode] } }),
    setQuickOpenQuery: (query) =>
      set((state) => ({ quickOpen: { ...state.quickOpen, query } })),
    closeQuickOpen: () => set({ quickOpen: { isOpen: false, query: "" } }),
  }),
);

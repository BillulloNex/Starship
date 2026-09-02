import { create } from "zustand";

export interface FilesTabState {
  selectedPath: string | null;
  // The conversation a selection belongs to. A file picked in one
  // conversation must not leak into another (it usually doesn't exist in the
  // other conversation's workspace, see issue #1350), so every selection is
  // tagged with its conversation and the files tab ignores a path owned by a
  // different conversation.
  selectedConversationId: string | null;
  openTabs: string[];
  dirtyFiles: Record<string, boolean>;
  isSidebarCollapsed: boolean;
  sidebarWidth: number;
  cursorPosition: { line: number; column: number } | null;
  previewModes: Record<string, "code" | "preview" | "split">;

  setSelectedPath: (
    path: string | null,
    conversationId?: string | null,
  ) => void;
  openTab: (path: string, conversationId?: string | null) => void;
  closeTab: (path: string) => void;
  closeOtherTabs: (path: string) => void;
  closeAllTabs: () => void;
  setFileDirty: (path: string, isDirty: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;
  setCursorPosition: (pos: { line: number; column: number } | null) => void;
  setFilePreviewMode: (
    path: string,
    mode: "code" | "preview" | "split",
  ) => void;
}

// Hoisted out of files-tab.tsx local state so non-React callers (e.g. the
// canvas_ui tool dispatcher in the WebSocket context) can drive selection.
export const useFilesTabStore = create<FilesTabState>((set, get) => ({
  selectedPath: null,
  selectedConversationId: null,
  openTabs: [],
  dirtyFiles: {},
  isSidebarCollapsed: true,
  sidebarWidth: 260,
  cursorPosition: null,
  previewModes: {},

  setSelectedPath: (selectedPath, conversationId = null) =>
    set((state) => {
      const convId = conversationId ?? state.selectedConversationId;
      // If switching conversations, reset tabs
      const isNewConv =
        conversationId && conversationId !== state.selectedConversationId;
      const prevTabs = isNewConv ? [] : state.openTabs;

      if (!selectedPath) {
        return {
          selectedPath: null,
          selectedConversationId: convId,
          openTabs: prevTabs,
        };
      }

      const newTabs = prevTabs.includes(selectedPath)
        ? prevTabs
        : [...prevTabs, selectedPath];

      return {
        selectedPath,
        selectedConversationId: convId,
        openTabs: newTabs,
      };
    }),

  openTab: (path: string, conversationId = null) => {
    get().setSelectedPath(path, conversationId);
  },

  closeTab: (path: string) =>
    set((state) => {
      const newTabs = state.openTabs.filter((t) => t !== path);
      const newDirty = { ...state.dirtyFiles };
      delete newDirty[path];

      let newSelected = state.selectedPath;
      if (state.selectedPath === path) {
        const oldIndex = state.openTabs.indexOf(path);
        if (newTabs.length === 0) {
          newSelected = null;
        } else if (oldIndex > 0) {
          newSelected = newTabs[oldIndex - 1];
        } else {
          newSelected = newTabs[0];
        }
      }

      return {
        openTabs: newTabs,
        selectedPath: newSelected,
        dirtyFiles: newDirty,
      };
    }),

  closeOtherTabs: (path: string) =>
    set((state) => {
      const newDirty = { ...state.dirtyFiles };
      Object.keys(newDirty).forEach((key) => {
        if (key !== path) delete newDirty[key];
      });

      return {
        openTabs: [path],
        selectedPath: path,
        dirtyFiles: newDirty,
      };
    }),

  closeAllTabs: () =>
    set(() => ({
      openTabs: [],
      selectedPath: null,
      dirtyFiles: {},
    })),

  setFileDirty: (path: string, isDirty: boolean) =>
    set((state) => {
      if (!isDirty && !state.dirtyFiles[path]) return state;
      const next = { ...state.dirtyFiles };
      if (isDirty) {
        next[path] = true;
      } else {
        delete next[path];
      }
      return { dirtyFiles: next };
    }),

  setSidebarCollapsed: (isSidebarCollapsed: boolean) =>
    set({ isSidebarCollapsed }),

  toggleSidebar: () =>
    set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),

  setSidebarWidth: (sidebarWidth: number) =>
    set({
      sidebarWidth: Math.min(600, Math.max(160, Math.round(sidebarWidth))),
    }),

  setCursorPosition: (cursorPosition) => set({ cursorPosition }),

  setFilePreviewMode: (path: string, mode: "code" | "preview" | "split") =>
    set((state) => ({
      previewModes: {
        ...state.previewModes,
        [path]: mode,
      },
    })),
}));

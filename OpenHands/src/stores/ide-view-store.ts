import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type ConversationViewMode = "agent" | "ide";

interface IdeViewState {
  /** Current view mode for the conversation — "agent" (default chat) or "ide" (docked panels). */
  viewMode: ConversationViewMode;
}

interface IdeViewActions {
  setViewMode: (mode: ConversationViewMode) => void;
  toggleViewMode: () => void;
}

type IdeViewStore = IdeViewState & IdeViewActions;

const STORAGE_KEY = "grokbot-ide-view";

// The chosen mode is remembered across reloads so people who live in the
// IDE don't land back in the chat view every time. The dock layout itself
// is intentionally not persisted.
export const useIdeViewStore = create<IdeViewStore>()(
  persist(
    (set) => ({
      viewMode: "agent",

      setViewMode: (viewMode) => set({ viewMode }),

      toggleViewMode: () =>
        set((state) => ({
          viewMode: state.viewMode === "agent" ? "ide" : "agent",
        })),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state): IdeViewState => ({ viewMode: state.viewMode }),
    },
  ),
);

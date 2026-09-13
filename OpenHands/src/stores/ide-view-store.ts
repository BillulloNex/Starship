import { create } from "zustand";

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

export const useIdeViewStore = create<IdeViewStore>()((set) => ({
  viewMode: "agent",

  setViewMode: (viewMode) => set({ viewMode }, false),

  toggleViewMode: () =>
    set(
      (state) => ({
        viewMode: state.viewMode === "agent" ? "ide" : "agent",
      }),
      false,
    ),
}));

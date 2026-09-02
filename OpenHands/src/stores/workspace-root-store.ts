import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface WorkspaceRootState {
  root: string | null;
}

interface WorkspaceRootActions {
  setRoot: (root: string) => void;
}

const STORAGE_KEY = "openhands-workspace-root";

export const useWorkspaceRootStore = create<
  WorkspaceRootState & WorkspaceRootActions
>()(
  persist(
    (set) => ({
      root: null,
      setRoot: (root) => set({ root: root.trim().replace(/(?!^)\/+$/, "") }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state): WorkspaceRootState => ({ root: state.root }),
    },
  ),
);

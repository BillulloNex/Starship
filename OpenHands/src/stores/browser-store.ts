import { create } from "zustand";

/**
 * "snapshot" replays the PNG the agent's browser tool captured — a still
 * image, so nothing in it can be clicked. "live" embeds the app itself over
 * the ingress preview route, which is what makes it interactive.
 */
export type BrowserViewMode = "snapshot" | "live" | "interactive";

interface BrowserState {
  // URL of the last page the agent navigated to in the browser panel.
  url: string;
  // Base64-encoded screenshot of the browser window, when the tool provides one.
  screenshotSrc: string;
  // Which pane to show, or null to let the panel decide from what's available
  // (see resolveBrowserViewMode). Set only by an explicit user choice, which
  // then sticks for the rest of the conversation.
  viewMode: BrowserViewMode | null;
  // Port chosen in the live pane; null means "follow whatever is listening".
  previewPort: number | null;
  // Bumped to force the preview iframe to remount and refetch.
  previewReloadCounter: number;
  vncUrl: string;
  vncReloadCounter: number;
}

interface BrowserStore extends BrowserState {
  setUrl: (url: string) => void;
  setScreenshotSrc: (screenshotSrc: string) => void;
  setViewMode: (viewMode: BrowserViewMode) => void;
  setPreviewPort: (previewPort: number | null) => void;
  reloadPreview: () => void;
  setVncUrl: (vncUrl: string) => void;
  reloadVnc: () => void;
  reset: () => void;
}

const initialState: BrowserState = {
  url: "",
  screenshotSrc: "",
  viewMode: null,
  previewPort: null,
  previewReloadCounter: 0,
  vncUrl: "",
  vncReloadCounter: 0,
};

/**
 * Pick a pane when the user hasn't chosen one.
 *
 * A screenshot means the agent just browsed somewhere and wants to show it, so
 * that wins. With no screenshot the tab would otherwise sit on "no page
 * loaded", and the live preview is the more useful thing to land on — it's
 * also the only pane that can be interacted with.
 */
export function resolveBrowserViewMode(
  viewMode: BrowserViewMode | null,
  screenshotSrc: string,
): BrowserViewMode {
  if (viewMode !== null) return viewMode;
  return screenshotSrc ? "snapshot" : "live";
}

export const useBrowserStore = create<BrowserStore>((set) => ({
  ...initialState,
  setUrl: (url: string) => set({ url }),
  setScreenshotSrc: (screenshotSrc: string) => set({ screenshotSrc }),
  setViewMode: (viewMode: BrowserViewMode) => set({ viewMode }),
  setPreviewPort: (previewPort: number | null) => set({ previewPort }),
  reloadPreview: () =>
    set((state) => ({ previewReloadCounter: state.previewReloadCounter + 1 })),
  setVncUrl: (vncUrl: string) => set({ vncUrl }),
  reloadVnc: () =>
    set((state) => ({ vncReloadCounter: state.vncReloadCounter + 1 })),
  reset: () => set(initialState),
}));

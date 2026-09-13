import type { AddPanelPositionOptions, DockviewApi } from "dockview-react";

export type WorkbenchPanelId =
  | "explorer"
  | "search"
  | "review"
  | "editor"
  | "terminal"
  | "chat"
  | "changes"
  | "browser"
  | "tasks";

export const PANEL_TITLES: Record<WorkbenchPanelId, string> = {
  explorer: "Explorer",
  search: "Search",
  review: "Review",
  editor: "Editor",
  terminal: "Terminal",
  chat: "Chat",
  changes: "Changes",
  browser: "Browser",
  tasks: "Tasks",
};

/** Panels shown when the IDE opens. */
export const DEFAULT_PANELS: WorkbenchPanelId[] = [
  "editor",
  "terminal",
  "explorer",
  "chat",
];

/** Panels that share the left dock. */
const LEFT_PANELS: WorkbenchPanelId[] = ["explorer", "search", "review"];

/** Panels that share the bottom dock with the terminal. */
const BOTTOM_PANELS: WorkbenchPanelId[] = [
  "terminal",
  "changes",
  "browser",
  "tasks",
];

interface DockSize {
  width?: number;
  height?: number;
}

const SIDE_SIZES: Partial<Record<WorkbenchPanelId, DockSize>> = {
  explorer: { width: 240 },
  search: { width: 240 },
  review: { width: 240 },
  chat: { width: 400 },
};
const BOTTOM_SIZE: DockSize = { height: 220 };

function findDockPanel(
  api: DockviewApi,
  dock: WorkbenchPanelId[],
  except?: WorkbenchPanelId,
) {
  return dock
    .filter((id) => id !== except)
    .map((id) => api.getPanel(id))
    .find((panel) => panel !== undefined);
}

function findBottomDockPanel(api: DockviewApi, except?: WorkbenchPanelId) {
  return findDockPanel(api, BOTTOM_PANELS, except);
}

function panelPosition(
  api: DockviewApi,
  id: WorkbenchPanelId,
): AddPanelPositionOptions | undefined {
  if (id === "editor") return undefined;
  if (id === "chat") return { direction: "right" };
  if (LEFT_PANELS.includes(id)) {
    const docked = findDockPanel(api, LEFT_PANELS, id);
    return docked
      ? { referencePanel: docked, direction: "within" }
      : { direction: "left" };
  }

  const docked = findBottomDockPanel(api, id);
  if (docked) return { referencePanel: docked, direction: "within" };
  if (api.getPanel("editor")) {
    return { referencePanel: "editor", direction: "below" };
  }
  return { direction: "below" };
}

/**
 * Current sizes of the side and bottom docks, so they can be restored after
 * dockview redistributes space when a panel opens or closes. The editor is
 * the only area that should absorb the change.
 */
function captureDockSizes(api: DockviewApi) {
  const sizes = new Map<string, DockSize>();
  Object.keys(SIDE_SIZES).forEach((id) => {
    const panel = api.getPanel(id);
    if (panel) sizes.set(id, { width: panel.group.width });
  });
  const bottom = findBottomDockPanel(api);
  if (bottom) sizes.set(bottom.id, { height: bottom.group.height });
  return sizes;
}

function restoreDockSizes(api: DockviewApi, sizes: Map<string, DockSize>) {
  sizes.forEach((size, id) => {
    const panel = api.getPanel(id);
    if (panel && (size.width || size.height)) panel.group.api.setSize(size);
  });
}

function defaultDockSize(api: DockviewApi, id: WorkbenchPanelId) {
  // A panel that joined an existing dock as a tab keeps that dock's size.
  if (LEFT_PANELS.includes(id) && findDockPanel(api, LEFT_PANELS, id)) {
    return undefined;
  }
  if (SIDE_SIZES[id]) return SIDE_SIZES[id];
  if (BOTTOM_PANELS.includes(id) && !findBottomDockPanel(api, id)) {
    return BOTTOM_SIZE;
  }
  return undefined;
}

/**
 * The editor group renders its own file tabs, so it hides the dockview tab
 * strip and refuses drops that would otherwise land behind that hidden strip.
 */
function configureEditorGroup(api: DockviewApi) {
  const group = api.getPanel("editor")?.group;
  if (!group) return;
  group.header.hidden = true;
  group.locked = "no-drop-target";
}

export function addWorkbenchPanel(api: DockviewApi, id: WorkbenchPanelId) {
  const existing = api.getPanel(id);
  if (existing) {
    existing.api.setActive();
    return;
  }

  const sizes = captureDockSizes(api);
  const size = defaultDockSize(api, id);
  const panel = api.addPanel({
    id,
    component: id,
    title: PANEL_TITLES[id],
    position: panelPosition(api, id),
  });
  if (id === "editor") configureEditorGroup(api);

  // Size the new dock first; restoring the others afterwards pushes any
  // leftover space into the editor.
  if (size) panel.group.api.setSize(size);
  restoreDockSizes(api, sizes);
}

/** Opens the panel if it is closed, closes it if it is open. */
export function toggleWorkbenchPanel(
  api: DockviewApi,
  id: WorkbenchPanelId,
): boolean {
  const existing = api.getPanel(id);
  if (!existing) {
    addWorkbenchPanel(api, id);
    return true;
  }
  const sizes = captureDockSizes(api);
  sizes.delete(id);
  existing.api.close();
  restoreDockSizes(api, sizes);
  return false;
}

/** Gives the side and bottom docks their default sizes. */
export function applyDefaultDockSizes(api: DockviewApi) {
  Object.entries(SIDE_SIZES).forEach(([id, size]) => {
    api.getPanel(id)?.group.api.setSize(size);
  });
  findBottomDockPanel(api)?.group.api.setSize(BOTTOM_SIZE);
}

export function applyDefaultLayout(api: DockviewApi) {
  DEFAULT_PANELS.forEach((id) => addWorkbenchPanel(api, id));
  api.getPanel("editor")?.api.setActive();
}

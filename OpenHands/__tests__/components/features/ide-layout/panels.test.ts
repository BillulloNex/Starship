import { describe, expect, it } from "vitest";
import type { DockviewApi } from "dockview-react";
import {
  addWorkbenchPanel,
  applyDefaultDockSizes,
  applyDefaultLayout,
  toggleWorkbenchPanel,
} from "#/components/features/ide-layout/workbench/panels";

interface FakePanel {
  id: string;
  position?: unknown;
  initialWidth?: number;
  initialHeight?: number;
  group: {
    header: { hidden: boolean };
    locked: boolean | string;
    size?: { width?: number; height?: number };
    width: number;
    height: number;
    api: { setSize: (size: { width?: number; height?: number }) => void };
  };
  api: { close: () => void; setActive: () => void };
  activated: boolean;
}

function createFakeApi() {
  const panels = new Map<string, FakePanel>();
  // Dockview redistributes space whenever the grid changes.
  const redistribute = () => {
    for (const panel of panels.values()) {
      panel.group.width = 999;
      panel.group.height = 999;
    }
  };
  const api = {
    getPanel: (id: string) => panels.get(id),
    get panels() {
      return [...panels.values()];
    },
    addPanel: (options: {
      id: string;
      position?: unknown;
      initialWidth?: number;
      initialHeight?: number;
    }) => {
      const panel: FakePanel = {
        ...options,
        group: {
          header: { hidden: false },
          locked: false,
          width: 0,
          height: 0,
          api: {
            setSize: (size) => {
              panel.group.size = size;
              if (size.width) panel.group.width = size.width;
              if (size.height) panel.group.height = size.height;
            },
          },
        },
        activated: false,
        api: {
          close: () => {
            panels.delete(options.id);
            redistribute();
          },
          setActive: () => {
            panel.activated = true;
          },
        },
      };
      panels.set(options.id, panel);
      redistribute();
      return panel;
    },
  };
  return { api: api as unknown as DockviewApi, panels };
}

describe("workbench panels", () => {
  it("opens explorer, editor, terminal, and chat by default", () => {
    const { api, panels } = createFakeApi();
    applyDefaultLayout(api);

    expect([...panels.keys()].sort()).toEqual(
      ["chat", "editor", "explorer", "terminal"].sort(),
    );
    expect(panels.get("explorer")?.position).toEqual({ direction: "left" });
    expect(panels.get("chat")?.position).toEqual({ direction: "right" });
    expect(panels.get("terminal")?.position).toEqual({
      referencePanel: "editor",
      direction: "below",
    });
  });

  it("sizes the side and bottom docks", () => {
    const { api, panels } = createFakeApi();
    applyDefaultLayout(api);
    applyDefaultDockSizes(api);
    expect(panels.get("explorer")?.group.width).toBe(240);
    expect(panels.get("chat")?.group.width).toBe(400);
    expect(panels.get("terminal")?.group.height).toBe(220);
    expect(panels.get("editor")?.group.size).toBeUndefined();
  });

  it("keeps the other docks' sizes when a panel is toggled", () => {
    const { api, panels } = createFakeApi();
    applyDefaultLayout(api);
    applyDefaultDockSizes(api);
    // The user resized the chat and the terminal.
    panels.get("chat")!.group.api.setSize({ width: 520 });
    panels.get("terminal")!.group.api.setSize({ height: 300 });

    toggleWorkbenchPanel(api, "explorer");
    expect(panels.get("chat")?.group.width).toBe(520);
    expect(panels.get("terminal")?.group.height).toBe(300);

    toggleWorkbenchPanel(api, "explorer");
    expect(panels.get("chat")?.group.width).toBe(520);
    expect(panels.get("terminal")?.group.height).toBe(300);
    expect(panels.get("explorer")?.group.width).toBe(240);
  });

  it("hides the editor group's dockview tabs and blocks drops into it", () => {
    const { api, panels } = createFakeApi();
    applyDefaultLayout(api);
    const { group } = panels.get("editor")!;
    expect(group.header.hidden).toBe(true);
    expect(group.locked).toBe("no-drop-target");
  });

  it("toggles a panel closed and back open", () => {
    const { api, panels } = createFakeApi();
    applyDefaultLayout(api);

    expect(toggleWorkbenchPanel(api, "terminal")).toBe(false);
    expect(panels.has("terminal")).toBe(false);
    expect(toggleWorkbenchPanel(api, "terminal")).toBe(true);
    expect(panels.has("terminal")).toBe(true);
  });

  it("docks auxiliary panels as tabs next to the terminal", () => {
    const { api, panels } = createFakeApi();
    applyDefaultLayout(api);

    addWorkbenchPanel(api, "changes");
    expect(panels.get("changes")?.position).toEqual({
      referencePanel: panels.get("terminal"),
      direction: "within",
    });
  });

  it("falls back below the editor when the bottom dock is empty", () => {
    const { api, panels } = createFakeApi();
    applyDefaultLayout(api);
    toggleWorkbenchPanel(api, "terminal");

    addWorkbenchPanel(api, "browser");
    expect(panels.get("browser")?.position).toEqual({
      referencePanel: "editor",
      direction: "below",
    });
  });

  it("focuses an already open panel instead of adding a duplicate", () => {
    const { api, panels } = createFakeApi();
    applyDefaultLayout(api);
    addWorkbenchPanel(api, "chat");
    expect(panels.get("chat")?.activated).toBe(true);
    expect(api.panels).toHaveLength(4);
  });
});

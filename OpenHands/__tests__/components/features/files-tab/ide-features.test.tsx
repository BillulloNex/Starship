/* eslint-disable react/jsx-props-no-spreading */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, vi } from "vitest";

import { useFilesTabStore } from "#/stores/files-tab-store";
import { EditorTabBar } from "#/components/features/files-tab/editor-tab-bar";
import { EditorStatusBar } from "#/components/features/files-tab/editor-status-bar";
import { EditorBreadcrumbs } from "#/components/features/files-tab/editor-breadcrumbs";
import { QuickFileSearchModal } from "#/components/features/files-tab/quick-file-search-modal";
import { FileTypeIcon } from "#/components/features/files-tab/file-type-icon";

describe("IDE Features", () => {
  beforeEach(() => {
    useFilesTabStore.setState({
      selectedPath: null,
      selectedConversationId: null,
      openTabs: [],
      dirtyFiles: {},
      isSidebarCollapsed: true,
      sidebarWidth: 260,
      cursorPosition: null,
      previewModes: {},
    });
  });

  describe("EditorTabBar", () => {
    it("renders open tabs and handles tab selection", async () => {
      const user = userEvent.setup();
      const onOpenSearch = vi.fn();

      useFilesTabStore.setState({
        openTabs: ["src/index.ts", "src/styles.css"],
        selectedPath: "src/index.ts",
      });

      render(<EditorTabBar onOpenSearchModal={onOpenSearch} />);

      expect(screen.getByTestId("editor-tab-src/index.ts")).toBeInTheDocument();
      expect(screen.getByTestId("editor-tab-src/styles.css")).toBeInTheDocument();

      // Click second tab to select it
      await user.click(screen.getByTestId("editor-tab-src/styles.css"));
      expect(useFilesTabStore.getState().selectedPath).toBe("src/styles.css");
    });

    it("displays unsaved dirty indicator dot on modified tabs", () => {
      useFilesTabStore.setState({
        openTabs: ["src/index.ts"],
        selectedPath: "src/index.ts",
        dirtyFiles: { "src/index.ts": true },
      });

      render(<EditorTabBar onOpenSearchModal={() => {}} />);

      expect(
        screen.getByTestId("tab-unsaved-dot-src/index.ts"),
      ).toBeInTheDocument();
    });

    it("closes tab when close button is clicked", async () => {
      const user = userEvent.setup();
      useFilesTabStore.setState({
        openTabs: ["src/a.ts", "src/b.ts"],
        selectedPath: "src/a.ts",
      });

      render(<EditorTabBar onOpenSearchModal={() => {}} />);

      await user.click(screen.getByTestId("tab-close-button-src/a.ts"));
      expect(useFilesTabStore.getState().openTabs).toEqual(["src/b.ts"]);
      expect(useFilesTabStore.getState().selectedPath).toBe("src/b.ts");
    });

    it("triggers search modal on Cmd+P button click", async () => {
      const user = userEvent.setup();
      const onOpenSearch = vi.fn();

      render(<EditorTabBar onOpenSearchModal={onOpenSearch} />);

      await user.click(screen.getByTestId("editor-quick-search-button"));
      expect(onOpenSearch).toHaveBeenCalledTimes(1);
    });
  });

  describe("EditorBreadcrumbs", () => {
    it("renders hierarchical directory segments and filename", () => {
      render(<EditorBreadcrumbs path="src/components/button.tsx" />);

      expect(screen.getByTestId("editor-breadcrumbs")).toBeInTheDocument();
      expect(screen.getByText("workspace")).toBeInTheDocument();
      expect(screen.getByText("src")).toBeInTheDocument();
      expect(screen.getByText("components")).toBeInTheDocument();
      expect(screen.getByText("button.tsx")).toBeInTheDocument();
    });
  });

  describe("EditorStatusBar", () => {
    it("renders line and column coordinates and language name", () => {
      useFilesTabStore.setState({
        cursorPosition: { line: 42, column: 18 },
      });

      render(<EditorStatusBar path="src/main.ts" />);

      expect(screen.getByTestId("editor-status-bar")).toBeInTheDocument();
      expect(screen.getByText("Ln 42, Col 18")).toBeInTheDocument();
      expect(screen.getByText("TypeScript")).toBeInTheDocument();
      expect(screen.getByText("UTF-8")).toBeInTheDocument();
    });
  });

  describe("QuickFileSearchModal", () => {
    it("filters files by query and selects on Enter", async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      const onClose = vi.fn();

      const paths = ["src/index.ts", "src/app.tsx", "README.md", "package.json"];

      render(
        <QuickFileSearchModal
          isOpen
          paths={paths}
          onSelectFile={onSelect}
          onClose={onClose}
        />,
      );

      const input = screen.getByPlaceholderText(/Search files by name/i);
      await user.type(input, "app");

      expect(
        screen.getByTestId("quick-file-search-item-src/app.tsx"),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId("quick-file-search-item-README.md"),
      ).not.toBeInTheDocument();

      await user.keyboard("{Enter}");
      expect(onSelect).toHaveBeenCalledWith("src/app.tsx");
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("FileTypeIcon", () => {
    it("renders without crashing for various file types", () => {
      const { container } = render(
        <div>
          <FileTypeIcon path="app.tsx" />
          <FileTypeIcon path="server.py" />
          <FileTypeIcon path="package.json" />
          <FileTypeIcon path="style.css" />
          <FileTypeIcon path="doc.md" />
        </div>,
      );
      expect(container.querySelectorAll("svg").length).toBe(5);
    });
  });
});

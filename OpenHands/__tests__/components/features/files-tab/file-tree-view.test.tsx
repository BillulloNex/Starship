import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

import { FileTreeView } from "#/components/features/files-tab/file-tree-view";

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe("FileTreeView", () => {
  it("shows the empty-state message and no tree when there are no files", () => {
    // Arrange + Act
    renderWithQueryClient(
      <FileTreeView paths={[]} selectedPath={null} onSelectFile={vi.fn()} />,
    );

    // Assert
    expect(screen.getByText("FILES$NO_FILES")).toBeInTheDocument();
    expect(screen.queryByTestId("file-tree-view")).not.toBeInTheDocument();
  });

  it("keeps a directory collapsed until clicked, then reveals its children", async () => {
    // Arrange
    const user = userEvent.setup();
    renderWithQueryClient(
      <FileTreeView
        paths={["src/main.ts"]}
        selectedPath={null}
        onSelectFile={vi.fn()}
      />,
    );

    // Assert: the directory row shows but its nested file is hidden.
    expect(screen.getByTestId("file-tree-dir-src")).toBeInTheDocument();
    expect(
      screen.queryByTestId("file-tree-file-src/main.ts"),
    ).not.toBeInTheDocument();

    // Act: expand the directory.
    await user.click(screen.getByTestId("file-tree-dir-src"));

    // Assert: the nested file is now visible.
    expect(
      screen.getByTestId("file-tree-file-src/main.ts"),
    ).toBeInTheDocument();
  });

  it("calls onSelectFile with the file path when a file row is clicked", async () => {
    // Arrange
    const user = userEvent.setup();
    const onSelectFile = vi.fn();
    renderWithQueryClient(
      <FileTreeView
        paths={["README.md"]}
        selectedPath={null}
        onSelectFile={onSelectFile}
      />,
    );

    // Act
    await user.click(screen.getByTestId("file-tree-file-README.md"));

    // Assert
    expect(onSelectFile).toHaveBeenCalledTimes(1);
    expect(onSelectFile).toHaveBeenCalledWith("README.md");
  });

  it("filters file tree based on search query", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(
      <FileTreeView
        paths={["src/index.ts", "docs/guide.md"]}
        selectedPath={null}
        onSelectFile={vi.fn()}
      />,
    );

    const searchInput = screen.getByPlaceholderText("Search files...");
    await user.type(searchInput, "guide");

    expect(screen.getByTestId("file-tree-dir-docs")).toBeInTheDocument();
    expect(screen.queryByTestId("file-tree-dir-src")).not.toBeInTheDocument();
  });
});

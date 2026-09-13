import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFilesTabStore } from "#/stores/files-tab-store";
import { useWorkbenchStore } from "#/stores/workbench-store";
import { SearchPanel } from "#/components/features/ide-layout/panels/search-panel";

const searchWorkspace = vi.fn();

vi.mock("#/context/workspace-runtime-context", () => ({
  useWorkspaceRuntime: () => ({
    workspaceKey: "ws",
    conversationId: "conv",
    conversationUrl: "http://localhost:18000/api/conversations/conv",
    sessionApiKey: "key",
    workingDir: "/workspace/project",
    isReady: true,
  }),
}));

vi.mock("#/api/runtime-service/workspace-search.service", () => ({
  searchWorkspace: (...args: unknown[]) => searchWorkspace(...args),
}));

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SearchPanel />
    </QueryClientProvider>,
  );
}

describe("SearchPanel", () => {
  beforeEach(() => {
    searchWorkspace.mockReset().mockResolvedValue({
      truncated: false,
      matches: [
        {
          path: "src/app.tsx",
          line: 2,
          column: 10,
          length: 6,
          text: "import { Button } from './button';",
        },
        {
          path: "src/app.tsx",
          line: 9,
          column: 8,
          length: 6,
          text: "<Button onClick={go}>",
        },
        {
          path: "src/button.tsx",
          line: 1,
          column: 17,
          length: 6,
          text: "export function Button() {}",
        },
      ],
    });
    useWorkbenchStore.setState({ pendingReveal: null });
    useFilesTabStore.setState({
      selectedConversationId: "ws",
      selectedPath: null,
      openTabs: [],
    });
  });

  it("searches as you type with the chosen options", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByTestId("ide-search-input"), "Button");
    await user.click(screen.getByRole("button", { name: "Match Case" }));

    await waitFor(() =>
      expect(searchWorkspace).toHaveBeenLastCalledWith(
        "http://localhost:18000/api/conversations/conv",
        "key",
        "/workspace/project",
        { query: "Button", matchCase: true, wholeWord: false, isRegex: false },
      ),
    );
    expect(await screen.findByText("3 results in 2 files")).toBeInTheDocument();
  });

  it("opens a match and asks the editor to reveal it", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.type(screen.getByTestId("ide-search-input"), "Button");

    await user.click(
      await screen.findByTestId("ide-search-match-src/app.tsx:9"),
    );
    expect(useFilesTabStore.getState().selectedPath).toBe("src/app.tsx");
    expect(useWorkbenchStore.getState().pendingReveal).toEqual({
      path: "src/app.tsx",
      line: 9,
      column: 8,
      length: 6,
    });
  });

  it("collapses a file's matches", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.type(screen.getByTestId("ide-search-input"), "Button");
    await screen.findByTestId("ide-search-match-src/button.tsx:1");

    await user.click(screen.getByText("button.tsx"));
    expect(
      screen.queryByTestId("ide-search-match-src/button.tsx:1"),
    ).not.toBeInTheDocument();
  });

  it("does not search an empty query", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.type(screen.getByTestId("ide-search-input"), "   ");
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(searchWorkspace).not.toHaveBeenCalled();
  });
});

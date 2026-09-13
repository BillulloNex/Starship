import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFilesTabStore } from "#/stores/files-tab-store";
import { useWorkbenchStore } from "#/stores/workbench-store";
import { ReviewPanel } from "#/components/features/ide-layout/panels/review-panel";

let reviewData: unknown;
const actions = {
  acceptFile: vi.fn(),
  acceptAll: vi.fn(),
  rejectFile: vi.fn(),
  isBusy: false,
};

vi.mock("#/context/workspace-runtime-context", () => ({
  useWorkspaceRuntime: () => ({ workspaceKey: "ws" }),
}));

vi.mock("#/components/features/ide-layout/review/use-review", () => ({
  useReviewChanges: () => ({
    data: reviewData,
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useReviewActions: () => actions,
}));

describe("ReviewPanel", () => {
  beforeEach(() => {
    reviewData = {
      isRepository: true,
      changes: [
        { path: "src/app.tsx", kind: "modified" },
        { path: "src/new.ts", kind: "added" },
        { path: "old.ts", kind: "deleted" },
      ],
    };
    Object.values(actions).forEach((value) => {
      if (typeof value === "function")
        (value as ReturnType<typeof vi.fn>).mockReset();
    });
    useWorkbenchStore.setState({ reviewPath: null });
    useFilesTabStore.setState({
      selectedConversationId: "ws",
      selectedPath: null,
      openTabs: [],
    });
  });

  it("lists unreviewed files and opens one for review", async () => {
    const user = userEvent.setup();
    render(<ReviewPanel />);
    expect(screen.getByText("3 unreviewed files")).toBeInTheDocument();

    await user.click(screen.getByTestId("review-open-src/app.tsx"));
    expect(useFilesTabStore.getState().selectedPath).toBe("src/app.tsx");
    expect(useWorkbenchStore.getState().reviewPath).toBe("src/app.tsx");
    expect(screen.getByTestId("review-open-old.ts")).toBeDisabled();
  });

  it("accepts a file or everything", async () => {
    const user = userEvent.setup();
    render(<ReviewPanel />);
    await user.click(
      screen.getByRole("button", { name: "Accept src/app.tsx" }),
    );
    expect(actions.acceptFile).toHaveBeenCalledWith("src/app.tsx");
    await user.click(screen.getByTestId("review-accept-all"));
    expect(actions.acceptAll).toHaveBeenCalled();
  });

  it("asks before rejecting, and warns that new files get deleted", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    render(<ReviewPanel />);

    await user.click(screen.getByRole("button", { name: "Reject src/new.ts" }));
    expect(confirm.mock.calls[0][0]).toContain("Delete src/new.ts");
    expect(actions.rejectFile).not.toHaveBeenCalled();

    confirm.mockReturnValueOnce(true);
    await user.click(
      screen.getByRole("button", { name: "Reject src/app.tsx" }),
    );
    expect(actions.rejectFile).toHaveBeenCalledWith("src/app.tsx");
    confirm.mockRestore();
  });

  it("explains what to do outside a git repository", () => {
    reviewData = { isRepository: false, changes: [] };
    render(<ReviewPanel />);
    expect(screen.getByText(/Initialize a repository/)).toBeInTheDocument();
  });

  it("shows when there's nothing to review", () => {
    reviewData = { isRepository: true, changes: [] };
    render(<ReviewPanel />);
    expect(screen.getByText("Nothing to review")).toBeInTheDocument();
  });
});

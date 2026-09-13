import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFilesTabStore } from "#/stores/files-tab-store";
import { useWorkbenchStore } from "#/stores/workbench-store";
import { workbenchDocuments } from "#/components/features/ide-layout/workbench/document-registry";
import { EditorPanel } from "#/components/features/ide-layout/panels/editor-panel";
import { createFakeMonaco, type FakeModel } from "./fake-monaco";

type ContentState = {
  data?: { path: string; kind: string; text: string | null; staticUrl: string };
  isLoading?: boolean;
  isError?: boolean;
  error?: Error | null;
};

let contentState: ContentState = {};
let reviewChanges: { path: string; kind: string }[] = [];
const save = vi.fn();
const acceptFile = vi.fn();

vi.mock("#/context/workspace-runtime-context", () => ({
  useWorkspaceRuntime: () => ({ workspaceKey: "ws" }),
}));

vi.mock("#/hooks/query/use-workspace-file-content", () => ({
  useWorkspaceFileContent: () => contentState,
  useWorkspaceFileReader: () => vi.fn(),
}));

vi.mock(
  "#/components/features/ide-layout/workbench/use-workbench-save",
  () => ({
    useWorkbenchSave: () => save,
  }),
);

vi.mock("#/components/features/ide-layout/editor/workbench-editor", () => ({
  WorkbenchEditor: ({
    path,
    diskText,
  }: {
    path: string | null;
    diskText: string | null;
  }) => (
    <div
      data-testid="workbench-editor"
      data-path={path ?? ""}
      data-disk-text={diskText ?? ""}
    />
  ),
}));

vi.mock("#/components/features/ide-layout/review/use-review", () => ({
  useReviewChanges: () => ({
    data: { isRepository: true, changes: reviewChanges },
  }),
  useReviewActions: () => ({ acceptFile, isBusy: false }),
}));

vi.mock("#/components/features/ide-layout/review/review-diff-view", () => ({
  ReviewDiffView: ({ path }: { path: string }) => (
    <div data-testid="review-diff-view" data-path={path} />
  ),
}));

vi.mock("#/components/features/files-tab/file-content-viewer", () => ({
  FileContentViewer: ({ path }: { path: string }) => (
    <div data-testid="rich-viewer" data-path={path} />
  ),
}));

vi.mock("#/components/features/ide-layout/editor/file-preview", () => ({
  FilePreview: ({ path }: { path: string }) => (
    <div data-testid="file-preview" data-path={path} />
  ),
}));

function selectFile(path: string | null) {
  useFilesTabStore.setState({
    selectedConversationId: "ws",
    selectedPath: path,
    openTabs: path ? [path] : [],
  });
}

describe("EditorPanel", () => {
  beforeEach(() => {
    contentState = {};
    reviewChanges = [];
    save.mockReset();
    acceptFile.mockReset();
    workbenchDocuments.close("ws", "src/app.ts", { force: true });
    useWorkbenchStore.setState({
      conflicts: {},
      savingPaths: {},
      reviewPath: null,
    });
    useFilesTabStore.setState({ previewModes: {}, dirtyFiles: {} });
  });

  it("shows shortcut hints when no file is open", () => {
    selectFile(null);
    render(<EditorPanel />);
    expect(screen.getByTestId("editor-watermark")).toBeInTheDocument();
    expect(screen.getByText("Go to File")).toBeInTheDocument();
  });

  it("opens text files straight into the editor", () => {
    selectFile("src/app.ts");
    contentState = {
      data: { path: "src/app.ts", kind: "text", text: "code", staticUrl: "" },
    };
    render(<EditorPanel />);

    const editor = screen.getByTestId("workbench-editor");
    expect(editor).toHaveAttribute("data-path", "src/app.ts");
    expect(editor).toHaveAttribute("data-disk-text", "code");
    expect(screen.getByTestId("workbench-status-bar")).toBeInTheDocument();
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  });

  it("keeps an already open document visible while its file re-reads", () => {
    const { monaco } = createFakeMonaco();
    workbenchDocuments.sync(monaco, "ws", "src/app.ts", "code");
    selectFile("src/app.ts");
    contentState = { isLoading: true };

    render(<EditorPanel />);
    expect(screen.getByTestId("workbench-editor")).toHaveAttribute(
      "data-path",
      "src/app.ts",
    );
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  });

  it("shows a loading state for a file opened for the first time", () => {
    selectFile("src/app.ts");
    contentState = { isLoading: true };
    render(<EditorPanel />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("uses the rich viewer for images and other non-text files", () => {
    selectFile("logo.png");
    contentState = {
      data: { path: "logo.png", kind: "image", text: null, staticUrl: "u" },
    };
    render(<EditorPanel />);
    expect(screen.getByTestId("rich-viewer")).toHaveAttribute(
      "data-path",
      "logo.png",
    );
  });

  it("previews Markdown beside the source in split mode", () => {
    selectFile("README.md");
    useFilesTabStore.setState({ previewModes: { "README.md": "split" } });
    contentState = {
      data: { path: "README.md", kind: "text", text: "# Hi", staticUrl: "" },
    };
    render(<EditorPanel />);
    expect(screen.getByTestId("file-preview")).toBeInTheDocument();
    expect(
      screen.getByTestId("workbench-editor").parentElement,
    ).not.toHaveClass("hidden");
  });

  it("offers to resolve a disk conflict", async () => {
    const user = userEvent.setup();
    const { monaco } = createFakeMonaco();
    workbenchDocuments.sync(monaco, "ws", "src/app.ts", "base");
    (
      workbenchDocuments.getModel("ws", "src/app.ts") as unknown as FakeModel
    ).type("mine");
    selectFile("src/app.ts");
    workbenchDocuments.sync(monaco, "ws", "src/app.ts", "theirs");
    contentState = {
      data: { path: "src/app.ts", kind: "text", text: "theirs", staticUrl: "" },
    };

    render(<EditorPanel />);
    expect(screen.getByTestId("editor-conflict-banner")).toBeInTheDocument();

    await user.click(screen.getByTestId("editor-conflict-keep-mine"));
    expect(workbenchDocuments.getBaseline("ws", "src/app.ts")).toBe("theirs");
    expect(save).toHaveBeenCalledWith("src/app.ts");
    expect(
      screen.queryByTestId("editor-conflict-banner"),
    ).not.toBeInTheDocument();
  });

  it("flags a file with unreviewed changes and opens it for review", async () => {
    const user = userEvent.setup();
    selectFile("src/app.tsx");
    reviewChanges = [{ path: "src/app.tsx", kind: "modified" }];
    contentState = {
      data: { path: "src/app.tsx", kind: "text", text: "code", staticUrl: "" },
    };
    render(<EditorPanel />);

    await user.click(screen.getByTestId("unreviewed-accept"));
    expect(acceptFile).toHaveBeenCalledWith("src/app.tsx");

    await user.click(screen.getByTestId("unreviewed-review"));
    expect(useWorkbenchStore.getState().reviewPath).toBe("src/app.tsx");
  });

  it("shows the review diff instead of the editor while reviewing", () => {
    selectFile("src/app.tsx");
    reviewChanges = [{ path: "src/app.tsx", kind: "modified" }];
    useWorkbenchStore.setState({ reviewPath: "src/app.tsx" });
    contentState = {
      data: { path: "src/app.tsx", kind: "text", text: "code", staticUrl: "" },
    };
    render(<EditorPanel />);

    expect(screen.getByTestId("review-diff-view")).toHaveAttribute(
      "data-path",
      "src/app.tsx",
    );
    expect(screen.getByTestId("workbench-editor").parentElement).toHaveClass(
      "hidden",
    );
    expect(
      screen.queryByTestId("unreviewed-changes-banner"),
    ).not.toBeInTheDocument();
  });
});

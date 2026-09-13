/* eslint-disable i18next/no-literal-string */
import { useWorkspaceRuntime } from "#/context/workspace-runtime-context";
import { useWorkspaceFileContent } from "#/hooks/query/use-workspace-file-content";
import { useSelectedWorkspaceFile } from "#/hooks/use-selected-workspace-file";
import { useFilesTabStore } from "#/stores/files-tab-store";
import { useWorkbenchStore } from "#/stores/workbench-store";
import { EditorTabBar } from "#/components/features/files-tab/editor-tab-bar";
import { EditorBreadcrumbs } from "#/components/features/files-tab/editor-breadcrumbs";
import { FileContentViewer } from "#/components/features/files-tab/file-content-viewer";
import { cn } from "#/utils/utils";
import { WorkbenchEditor } from "../editor/workbench-editor";
import { WorkbenchStatusBar } from "../editor/workbench-status-bar";
import { ConflictBanner } from "../editor/conflict-banner";
import { FilePreview } from "../editor/file-preview";
import { EditorWatermark } from "../editor/editor-watermark";
import { workbenchDocuments } from "../workbench/document-registry";

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#141414] text-sm text-[var(--oh-muted)]">
      {children}
    </div>
  );
}

/**
 * The IDE's editor area: file tabs, breadcrumbs, one Monaco editor, and a
 * status bar. Images, PDFs, and binaries fall back to the Files tab viewer;
 * Markdown and HTML can be previewed beside or instead of the source.
 */
export function EditorPanel() {
  const { workspaceKey } = useWorkspaceRuntime();
  const selectedPath = useSelectedWorkspaceFile();
  const previewMode = useFilesTabStore((s) =>
    selectedPath ? (s.previewModes[selectedPath] ?? "code") : "code",
  );
  const hasConflict = useWorkbenchStore(
    (s) => !!(selectedPath && s.conflicts[selectedPath]),
  );
  const openQuickOpen = useWorkbenchStore((s) => s.openQuickOpen);

  const content = useWorkspaceFileContent(selectedPath);
  const data =
    content.data && content.data.path === selectedPath
      ? content.data
      : undefined;

  const hasDocument =
    !!workspaceKey &&
    !!selectedPath &&
    workbenchDocuments.has(workspaceKey, selectedPath);
  const isText = hasDocument || (data?.kind === "text" && data.text !== null);
  const isNonText = !hasDocument && !!data && !isText;

  const showEditor = !!selectedPath && isText && previewMode !== "preview";
  const showPreview = !!selectedPath && isText && previewMode !== "code";

  let overlay: React.ReactNode = null;
  if (!selectedPath) {
    overlay = <EditorWatermark />;
  } else if (!isText && !isNonText) {
    overlay = (
      <CenteredMessage>
        {content.isError
          ? ((content.error as Error | null)?.message ?? "Couldn't open file")
          : "Loading…"}
      </CenteredMessage>
    );
  }

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden bg-[#141414]"
      data-testid="ide-editor-panel"
    >
      <EditorTabBar
        onOpenSearchModal={() => openQuickOpen("files")}
        showSidebarToggle={false}
      />
      {selectedPath && <EditorBreadcrumbs path={selectedPath} />}
      {selectedPath && hasConflict && <ConflictBanner path={selectedPath} />}

      <div className="relative flex min-h-0 flex-1">
        <div
          className={cn(
            "h-full min-w-0",
            showEditor ? "flex-1" : "hidden",
            showEditor && showPreview && "border-r border-[var(--oh-border)]",
          )}
        >
          <WorkbenchEditor
            path={isText ? selectedPath : null}
            diskText={data?.kind === "text" ? data.text : null}
          />
        </div>
        {showPreview && selectedPath && (
          <div className="h-full min-w-0 flex-1">
            <FilePreview path={selectedPath} />
          </div>
        )}
        {isNonText && selectedPath && (
          <div className="h-full min-w-0 flex-1">
            <FileContentViewer path={selectedPath} viewMode="rich" />
          </div>
        )}
        {overlay}
      </div>

      {selectedPath && isText && <WorkbenchStatusBar path={selectedPath} />}
    </div>
  );
}

import React from "react";
import { useTranslation } from "react-i18next";

import { I18nKey } from "#/i18n/declaration";
import { useWorkspaceFileContent } from "#/hooks/query/use-workspace-file-content";
import {
  useWorkspaceMutationCounter,
  withWorkspaceCacheBuster,
} from "#/stores/use-workspace-mutation-counter";
import { MarkdownRenderer } from "#/components/features/markdown/markdown-renderer";
import { isMarkdownFilePath } from "#/utils/is-markdown-file-path";
import { useFilesTabStore } from "#/stores/files-tab-store";
import { FileCodeEditor } from "./file-code-editor";
import { HighlightedSourceView } from "./highlighted-source-view";
import type { ViewMode } from "./view-mode";

interface FileContentViewerProps {
  path: string;
  viewMode: ViewMode;
}

const HTML_LIKE_EXTS = new Set(["html", "htm", "svg"]);

// Office/document formats we can't preview inline. The label doubles as the
// allow-list (a present entry => Office doc) and feeds a clear, format-named
// "no preview" message instead of the generic binary fallback.
const OFFICE_DOCUMENT_LABELS: Record<string, string> = {
  pptx: "PowerPoint",
  ppt: "PowerPoint",
  docx: "Word",
  doc: "Word",
  xlsx: "Excel",
  xls: "Excel",
};

function getExtension(path: string): string {
  const idx = path.lastIndexOf(".");
  return idx === -1 ? "" : path.slice(idx + 1).toLowerCase();
}

/**
 * Fallback shown when a file's bytes aren't previewable. Office documents
 * (.pptx / .docx / .xlsx …) get a clear, format-named message; every other
 * binary keeps the generic "binary file" string so the pane is never blank.
 */
function UnpreviewableFallback({ path }: { path: string }) {
  const { t } = useTranslation("openhands");
  const documentLabel = OFFICE_DOCUMENT_LABELS[getExtension(path)];
  return (
    <div
      className="flex h-full w-full items-center justify-center text-sm text-[var(--oh-muted)]"
      data-testid={
        documentLabel
          ? "file-content-viewer-unsupported-document"
          : "file-content-viewer-binary-fallback"
      }
    >
      {documentLabel
        ? t(I18nKey.FILES$UNSUPPORTED_DOCUMENT, { type: documentLabel })
        : t(I18nKey.FILES$BINARY_FALLBACK)}
    </div>
  );
}

/**
 * Renders the contents of a single workspace file. In `rich` mode we point
 * an iframe / <img> straight at the agent server's static workspace
 * fileserver for HTML / SVG / images / PDFs, so relative asset references
 * load naturally. In `plain` mode we always show the raw bytes as text (or
 * a fallback message for binaries). In `edit` mode we show the Monaco editor.
 */
export function FileContentViewer({ path, viewMode }: FileContentViewerProps) {
  const { t } = useTranslation("openhands");
  const query = useWorkspaceFileContent(path);
  const previewModes = useFilesTabStore((s) => s.previewModes);
  // Subscribe to the workspace mutation counter so the iframe / <img> src
  // changes after every agent-side edit, forcing a fresh fetch even when
  // the *path* hasn't moved.
  const mutationCounter = useWorkspaceMutationCounter((state) => state.count);

  if (query.isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-[var(--oh-muted)]">
        {t(I18nKey.FILES$LOADING_FILES)}
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div
        className="flex h-full w-full items-center justify-center text-sm text-[var(--oh-muted)]"
        data-testid="file-content-viewer-error"
      >
        {(query.error as Error | undefined)?.message ??
          t(I18nKey.FILES$LOAD_ERROR)}
      </div>
    );
  }

  const { kind, text, staticUrl, mimeType } = query.data;
  const bustedStaticUrl = withWorkspaceCacheBuster(staticUrl, mutationCounter);
  const filePreviewMode = previewModes[path] || "code";

  // ----- Edit mode: editable Monaco code editor with save functionality. -----
  if (viewMode === "edit") {
    if (kind === "text" && text !== null) {
      return <FileCodeEditor path={path} initialContent={text} />;
    }
    return <UnpreviewableFallback path={path} />;
  }

  // ----- Plain mode: raw source bytes, syntax-highlighted when we can
  // recognize the grammar (falls through to a `<pre>` otherwise).
  if (viewMode === "plain") {
    if (kind === "text" && text !== null) {
      return (
        <HighlightedSourceView
          path={path}
          text={text}
          mimeType={mimeType ?? undefined}
        />
      );
    }
    return <UnpreviewableFallback path={path} />;
  }

  // ----- Split View Mode: Side-by-side code editor and live preview -----
  if (filePreviewMode === "split" && kind === "text" && text !== null) {
    const isMarkdown = isMarkdownFilePath(path);
    const isHtml =
      mimeType === "text/html" || HTML_LIKE_EXTS.has(getExtension(path));

    return (
      <div className="flex h-full w-full min-h-0 divide-x divide-[var(--oh-border)]">
        <div className="flex-1 h-full min-h-0 min-w-0">
          <FileCodeEditor path={path} initialContent={text} />
        </div>
        <div className="flex-1 h-full min-h-0 min-w-0 overflow-auto bg-[var(--oh-surface)] custom-scrollbar-always">
          {isMarkdown ? (
            <div
              data-testid="file-content-viewer-markdown"
              className="h-full w-full overflow-auto bg-[var(--oh-surface)] text-white custom-scrollbar-always [--oh-scroll-fade-from:var(--oh-surface)]"
            >
              <div className="prose prose-sm prose-invert max-w-none p-6 [--tw-prose-body:#fff] [--tw-prose-bold:#fff] [--tw-prose-headings:#fff] [--tw-prose-lead:#fff] [--tw-prose-counters:#fff] [--tw-prose-quotes:#fff] [--tw-prose-quote-borders:var(--oh-border-subtle)] [--tw-prose-bullets:var(--oh-muted)] [--tw-prose-hr:var(--oh-border-subtle)] [--tw-prose-captions:var(--oh-muted)] [--tw-prose-kbd:#fff]">
                <MarkdownRenderer
                  content={text ?? ""}
                  includeStandard
                  includeHeadings
                />
              </div>
            </div>
          ) : isHtml ? (
            <iframe
              title={path}
              src={bustedStaticUrl}
              sandbox="allow-same-origin"
              data-testid="file-content-viewer-iframe"
              className="h-full w-full bg-white"
            />
          ) : null}
        </div>
      </div>
    );
  }

  // ----- Rich mode: render HTML, markdown, images, PDFs from staticUrl. ----
  if (kind === "image") {
    return (
      <div
        className="flex h-full w-full items-center justify-center bg-[var(--oh-surface)] p-4"
        data-testid="file-content-viewer-image"
      >
        <img
          src={bustedStaticUrl}
          alt={path}
          className="max-h-full max-w-full object-contain"
        />
      </div>
    );
  }

  if (kind === "pdf") {
    return (
      <iframe
        title={path}
        src={bustedStaticUrl}
        sandbox="allow-same-origin"
        data-testid="file-content-viewer-iframe"
        className="h-full w-full bg-white"
      />
    );
  }

  if (kind === "binary") {
    return <UnpreviewableFallback path={path} />;
  }

  // Text-like content: Markdown
  if (kind === "text" && isMarkdownFilePath(path)) {
    return (
      <div
        data-testid="file-content-viewer-markdown"
        className="h-full w-full overflow-auto bg-[var(--oh-surface)] text-white custom-scrollbar-always [--oh-scroll-fade-from:var(--oh-surface)]"
      >
        <div className="prose prose-sm prose-invert max-w-none p-6 [--tw-prose-body:#fff] [--tw-prose-bold:#fff] [--tw-prose-headings:#fff] [--tw-prose-lead:#fff] [--tw-prose-counters:#fff] [--tw-prose-quotes:#fff] [--tw-prose-quote-borders:var(--oh-border-subtle)] [--tw-prose-bullets:var(--oh-muted)] [--tw-prose-hr:var(--oh-border-subtle)] [--tw-prose-captions:var(--oh-muted)] [--tw-prose-kbd:#fff]">
          <MarkdownRenderer
            content={text ?? ""}
            includeStandard
            includeHeadings
          />
        </div>
      </div>
    );
  }

  // Text-like content: HTML
  if (mimeType === "text/html" || HTML_LIKE_EXTS.has(getExtension(path))) {
    return (
      <iframe
        title={path}
        src={bustedStaticUrl}
        sandbox="allow-same-origin"
        data-testid="file-content-viewer-iframe"
        className="h-full w-full bg-white"
      />
    );
  }

  // Rich mode for actual source code (.ts, .py, .yaml, .css, …):
  // Render syntax-highlighted source view for plain inspection
  if (kind === "text" && text !== null) {
    return (
      <HighlightedSourceView
        path={path}
        text={text}
        mimeType={mimeType ?? undefined}
      />
    );
  }

  return <UnpreviewableFallback path={path} />;
}

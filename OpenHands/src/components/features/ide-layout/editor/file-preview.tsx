import { useWorkspaceFileContent } from "#/hooks/query/use-workspace-file-content";
import {
  useWorkspaceMutationCounter,
  withWorkspaceCacheBuster,
} from "#/stores/use-workspace-mutation-counter";
import { MarkdownRenderer } from "#/components/features/markdown/markdown-renderer";
import { isMarkdownFilePath } from "#/utils/is-markdown-file-path";

const PROSE_CLASSES =
  "prose prose-sm prose-invert max-w-none p-6 [--tw-prose-body:#fff] [--tw-prose-bold:#fff] [--tw-prose-headings:#fff] [--tw-prose-lead:#fff] [--tw-prose-counters:#fff] [--tw-prose-quotes:#fff] [--tw-prose-quote-borders:var(--oh-border-subtle)] [--tw-prose-bullets:var(--oh-muted)] [--tw-prose-hr:var(--oh-border-subtle)] [--tw-prose-captions:var(--oh-muted)] [--tw-prose-kbd:#fff]";

interface FilePreviewProps {
  path: string;
}

/** Rendered Markdown or HTML for the editor's split / preview modes. */
export function FilePreview({ path }: FilePreviewProps) {
  const { data } = useWorkspaceFileContent(path);
  const mutationCount = useWorkspaceMutationCounter((s) => s.count);

  if (!data || data.path !== path) return null;

  if (isMarkdownFilePath(path)) {
    return (
      <div
        data-testid="workbench-markdown-preview"
        className="h-full w-full overflow-auto bg-[var(--oh-surface)] text-white custom-scrollbar-always"
      >
        <div className={PROSE_CLASSES}>
          <MarkdownRenderer
            content={data.text ?? ""}
            includeStandard
            includeHeadings
          />
        </div>
      </div>
    );
  }

  // Same sandbox as the Files tab: never allow scripts alongside
  // same-origin, or the page could read the app's session key.
  return (
    <iframe
      title={path}
      src={withWorkspaceCacheBuster(data.staticUrl, mutationCount)}
      sandbox="allow-same-origin"
      data-testid="workbench-html-preview"
      className="h-full w-full bg-white"
    />
  );
}

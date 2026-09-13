/* eslint-disable i18next/no-literal-string */
import { Check, RefreshCw, Undo2 } from "lucide-react";
import { useWorkspaceRuntime } from "#/context/workspace-runtime-context";
import type {
  ReviewChange,
  ReviewChangeKind,
} from "#/api/runtime-service/workspace-review.service";
import { useFilesTabStore } from "#/stores/files-tab-store";
import { useWorkbenchStore } from "#/stores/workbench-store";
import { FileTypeIcon } from "#/components/features/files-tab/file-type-icon";
import { cn } from "#/utils/utils";
import { useReviewActions, useReviewChanges } from "../review/use-review";
import { workbenchDocuments } from "../workbench/document-registry";

const KIND_LABEL: Record<
  ReviewChangeKind,
  { letter: string; className: string }
> = {
  modified: { letter: "M", className: "text-amber-300" },
  added: { letter: "A", className: "text-emerald-400" },
  deleted: { letter: "D", className: "text-red-400" },
};

function confirmReject(change: ReviewChange): boolean {
  const message =
    change.kind === "added"
      ? `Delete ${change.path}? It isn't tracked by git, so this can't be undone.`
      : `Discard all unreviewed changes to ${change.path}?`;
  return window.confirm(message);
}

/**
 * Everything that changed since it was last reviewed — typically the agent's
 * work while you were away. Accepting stages a file in git; rejecting
 * restores the reviewed version.
 */
export function ReviewPanel() {
  const { workspaceKey } = useWorkspaceRuntime();
  const changesQuery = useReviewChanges();
  const actions = useReviewActions();
  const reviewPath = useWorkbenchStore((s) => s.reviewPath);

  const result = changesQuery.data;
  const changes = result?.isRepository ? result.changes : [];

  const openForReview = (change: ReviewChange) => {
    if (change.kind === "deleted") return;
    useFilesTabStore.getState().setSelectedPath(change.path, workspaceKey);
    useWorkbenchStore.getState().setReviewPath(change.path);
  };

  const reject = async (change: ReviewChange) => {
    if (!confirmReject(change)) return;
    await actions.rejectFile(change.path);
    // A rejected new file is gone; restored files reload on their own.
    if (workspaceKey && change.kind === "added") {
      useFilesTabStore.getState().closeTab(change.path);
      workbenchDocuments.close(workspaceKey, change.path, { force: true });
    }
    if (useWorkbenchStore.getState().reviewPath === change.path) {
      useWorkbenchStore.getState().setReviewPath(null);
    }
  };

  let body: React.ReactNode;
  if (changesQuery.isLoading) {
    body = <p className="p-3 text-xs text-[var(--oh-muted)]">Loading…</p>;
  } else if (changesQuery.isError) {
    body = (
      <p className="p-3 text-xs text-[var(--oh-muted)]">
        Couldn&apos;t read changes from git.
      </p>
    );
  } else if (result && !result.isRepository) {
    body = (
      <p className="p-3 text-xs text-[var(--oh-muted)]">
        Review uses git to track what you&apos;ve accepted. Initialize a
        repository in this workspace to review changes.
      </p>
    );
  } else if (changes.length === 0) {
    body = (
      <div className="p-3 text-xs text-[var(--oh-muted)]">
        <p className="text-white">Nothing to review</p>
        <p className="mt-1">
          New changes from the agent (or anyone) show up here until you accept
          or reject them.
        </p>
      </div>
    );
  } else {
    body = (
      <ul className="py-1">
        {changes.map((change) => {
          const name = change.path.split("/").pop() ?? change.path;
          const dir = change.path.slice(0, change.path.lastIndexOf("/"));
          const kind = KIND_LABEL[change.kind];
          return (
            <li
              key={change.path}
              className={cn(
                "group flex items-center gap-1 pl-2 pr-1 text-xs hover:bg-[var(--oh-interactive-hover)]",
                reviewPath === change.path &&
                  "bg-[var(--oh-interactive-hover)]",
              )}
            >
              <button
                type="button"
                onClick={() => openForReview(change)}
                disabled={change.kind === "deleted"}
                data-testid={`review-open-${change.path}`}
                className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left disabled:cursor-default"
              >
                <FileTypeIcon
                  path={change.path}
                  className="h-3.5 w-3.5 shrink-0"
                />
                <span
                  className={cn(
                    "shrink-0 text-white",
                    change.kind === "deleted" && "line-through opacity-70",
                  )}
                >
                  {name}
                </span>
                <span className="min-w-0 truncate text-[11px] text-[var(--oh-muted)]">
                  {dir}
                </span>
              </button>
              <button
                type="button"
                title="Accept"
                aria-label={`Accept ${change.path}`}
                onClick={() => actions.acceptFile(change.path)}
                disabled={actions.isBusy}
                className="rounded p-0.5 text-[var(--oh-muted)] opacity-0 hover:bg-white/10 hover:text-emerald-400 group-hover:opacity-100 disabled:opacity-30"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title="Reject"
                aria-label={`Reject ${change.path}`}
                onClick={() => reject(change)}
                disabled={actions.isBusy}
                className="rounded p-0.5 text-[var(--oh-muted)] opacity-0 hover:bg-white/10 hover:text-red-400 group-hover:opacity-100 disabled:opacity-30"
              >
                <Undo2 className="h-3.5 w-3.5" />
              </button>
              <span
                className={cn(
                  "w-3 shrink-0 text-center font-mono text-[11px]",
                  kind.className,
                )}
              >
                {kind.letter}
              </span>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div
      className="flex h-full w-full flex-col bg-[var(--oh-surface)]"
      data-testid="ide-review-panel"
    >
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-[var(--oh-border-subtle)] px-2 text-xs">
        <span className="text-[var(--oh-muted)]">
          {changes.length > 0
            ? `${changes.length} unreviewed ${changes.length === 1 ? "file" : "files"}`
            : "Review"}
        </span>
        <button
          type="button"
          title="Refresh"
          aria-label="Refresh"
          onClick={() => changesQuery.refetch()}
          className="ml-auto rounded p-1 text-[var(--oh-muted)] hover:bg-[var(--oh-interactive-hover)] hover:text-white"
        >
          <RefreshCw
            className={cn("h-3 w-3", changesQuery.isFetching && "animate-spin")}
          />
        </button>
        {changes.length > 0 && (
          <button
            type="button"
            onClick={() => actions.acceptAll()}
            disabled={actions.isBusy}
            data-testid="review-accept-all"
            className="rounded bg-emerald-600/80 px-2 py-0.5 font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            Accept all
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar-always">
        {body}
      </div>
    </div>
  );
}

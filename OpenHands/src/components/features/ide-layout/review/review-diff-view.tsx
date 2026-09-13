/* eslint-disable i18next/no-literal-string */
import React from "react";
import { DiffEditor, type Monaco } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { Check, ChevronDown, ChevronUp, Undo2, X } from "lucide-react";
import { useWorkspaceRuntime } from "#/context/workspace-runtime-context";
import { useFilesTabStore } from "#/stores/files-tab-store";
import { useWorkbenchStore } from "#/stores/workbench-store";
import { workbenchDocuments } from "../workbench/document-registry";
import { useWorkbenchSave } from "../workbench/use-workbench-save";
import {
  acceptLineChange,
  findChangeIndex,
  rejectLineChange,
  type LineChange,
} from "./hunks";
import { useReviewActions, useReviewedVersion } from "./use-review";

const DIFF_OPTIONS: editor.IDiffEditorConstructionOptions = {
  renderSideBySide: false,
  originalEditable: false,
  readOnly: false,
  automaticLayout: true,
  fixedOverflowWidgets: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  fontSize: 13,
  lineHeight: 20,
  renderMarginRevertIcon: true,
  renderOverviewRuler: true,
  ignoreTrimWhitespace: false,
  diffAlgorithm: "advanced",
};

function BarButton({
  onClick,
  disabled,
  title,
  children,
  tone = "default",
  testId,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
  tone?: "default" | "accept" | "reject";
  testId?: string;
}) {
  const toneClass = {
    default: "text-[var(--oh-muted)] hover:text-white",
    accept: "text-emerald-300 hover:text-emerald-200",
    reject: "text-red-300 hover:text-red-200",
  }[tone];
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={`flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-white/10 disabled:opacity-40 ${toneClass}`}
    >
      {children}
    </button>
  );
}

interface ReviewDiffViewProps {
  path: string;
}

/**
 * Inline diff of a file's unreviewed changes against its reviewed version
 * (what git has staged or committed). The right-hand side is the live
 * document, so edits made here are real edits. Accepting a change records
 * it in git; rejecting one undoes it in the file.
 */
export function ReviewDiffView({ path }: ReviewDiffViewProps) {
  const { workspaceKey } = useWorkspaceRuntime();
  const reviewed = useReviewedVersion(path);
  const actions = useReviewActions();
  const save = useWorkbenchSave();

  const diffRef = React.useRef<editor.IStandaloneDiffEditor | null>(null);
  const originalRef = React.useRef<editor.ITextModel | null>(null);
  const [isMounted, setIsMounted] = React.useState(false);
  const [changes, setChanges] = React.useState<LineChange[]>([]);
  const [current, setCurrent] = React.useState(0);
  const changesRef = React.useRef<LineChange[]>([]);

  const documentModel = workspaceKey
    ? workbenchDocuments.getModel(workspaceKey, path)
    : null;
  const reviewedText = reviewed.data;
  const isNewFile = reviewed.isSuccess && reviewedText === null;

  const exitReview = React.useCallback(() => {
    useWorkbenchStore.getState().setReviewPath(null);
  }, []);

  const handleMount = React.useCallback(
    (instance: editor.IStandaloneDiffEditor, monaco: Monaco) => {
      diffRef.current = instance;
      const model = workspaceKey
        ? workbenchDocuments.getModel(workspaceKey, path)
        : null;
      if (!model) return;

      const initial = instance.getModel();
      const original = monaco.editor.createModel(
        "",
        model.getLanguageId(),
        monaco.Uri.from({
          scheme: "grokbot-review",
          path: `/${encodeURIComponent(workspaceKey ?? "")}/${path}`,
        }),
      );
      originalRef.current = original;
      instance.setModel({ original, modified: model });
      initial?.original.dispose();
      initial?.modified.dispose();

      instance.onDidUpdateDiff(() => {
        const next = instance.getLineChanges() ?? [];
        changesRef.current = next;
        setChanges(next);
      });
      const modifiedEditor = instance.getModifiedEditor();
      modifiedEditor.onDidChangeCursorPosition((event) => {
        setCurrent(
          findChangeIndex(changesRef.current, event.position.lineNumber),
        );
      });
      modifiedEditor.onDidBlurEditorWidget(() => {
        if (workspaceKey && workbenchDocuments.isDirty(workspaceKey, path)) {
          save(path);
        }
      });
      setIsMounted(true);
    },
    [workspaceKey, path, save],
  );

  React.useEffect(() => {
    if (!isMounted || reviewedText === undefined) return;
    const original = originalRef.current;
    const next = reviewedText ?? "";
    if (original && original.getValue() !== next) original.setValue(next);
  }, [isMounted, reviewedText]);

  React.useEffect(
    () => () => {
      diffRef.current?.setModel(null);
      originalRef.current?.dispose();
      originalRef.current = null;
    },
    [],
  );

  // Once nothing differs, the file is fully reviewed.
  const isResolved =
    isMounted &&
    reviewed.isSuccess &&
    !reviewed.isFetching &&
    changes.length === 0;
  React.useEffect(() => {
    if (!isResolved || !documentModel || !originalRef.current) return;
    if (originalRef.current.getValue() === documentModel.getValue()) {
      exitReview();
    }
  }, [isResolved, documentModel, exitReview]);

  if (!documentModel) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--oh-muted)]">
        Loading…
      </div>
    );
  }

  const change = changes[Math.min(current, changes.length - 1)];
  const busy = actions.isBusy;

  const saveIfDirty = async () => {
    if (!workspaceKey || !workbenchDocuments.isDirty(workspaceKey, path)) {
      return true;
    }
    const outcome = await save(path);
    return outcome === "saved" || outcome === "clean";
  };

  const acceptChange = async () => {
    const original = originalRef.current;
    if (!change || !original) return;
    const next = acceptLineChange(
      original.getValue(),
      documentModel.getValue(),
      change,
    );
    original.setValue(next);
    await actions.writeReviewedVersion({ path, content: next });
  };

  const rejectChange = async () => {
    const original = originalRef.current;
    if (!change || !original || !workspaceKey) return;
    const next = rejectLineChange(
      original.getValue(),
      documentModel.getValue(),
      change,
    );
    workbenchDocuments.replaceContent(workspaceKey, path, next);
    await save(path);
  };

  const acceptAll = async () => {
    if (!(await saveIfDirty())) return;
    await actions.acceptFile(path);
    exitReview();
  };

  const rejectAll = async () => {
    if (!workspaceKey) return;
    if (isNewFile) {
      if (!window.confirm(`Delete ${path}? It isn't tracked by git.`)) return;
      await actions.rejectFile(path);
      exitReview();
      useFilesTabStore.getState().closeTab(path);
      workbenchDocuments.close(workspaceKey, path, { force: true });
      return;
    }
    workbenchDocuments.replaceContent(workspaceKey, path, reviewedText ?? "");
    await save(path);
    exitReview();
  };

  return (
    <div className="flex h-full w-full flex-col" data-testid="review-diff-view">
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-[#528bff]/30 bg-[#528bff]/10 px-2 text-xs text-white">
        <span className="mr-1 font-medium">Review</span>
        <span className="text-[var(--oh-muted)]">
          {changes.length === 0
            ? "No changes"
            : `Change ${Math.min(current, changes.length - 1) + 1} of ${changes.length}`}
        </span>
        <BarButton
          title="Previous change"
          onClick={() => diffRef.current?.goToDiff("previous")}
          disabled={changes.length === 0}
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </BarButton>
        <BarButton
          title="Next change"
          onClick={() => diffRef.current?.goToDiff("next")}
          disabled={changes.length === 0}
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </BarButton>
        <span className="mx-1 h-4 w-px bg-white/10" />
        <BarButton
          title="Accept this change"
          tone="accept"
          onClick={acceptChange}
          disabled={!change || busy}
          testId="review-accept-change"
        >
          <Check className="h-3.5 w-3.5" /> Accept
        </BarButton>
        <BarButton
          title="Reject this change"
          tone="reject"
          onClick={rejectChange}
          disabled={!change || busy}
          testId="review-reject-change"
        >
          <Undo2 className="h-3.5 w-3.5" /> Reject
        </BarButton>
        <div className="ml-auto flex items-center gap-1">
          <BarButton
            title="Accept every change in this file"
            tone="accept"
            onClick={acceptAll}
            disabled={busy}
            testId="review-accept-file"
          >
            Accept file
          </BarButton>
          <BarButton
            title={
              isNewFile
                ? "Delete this new file"
                : "Reject every change in this file"
            }
            tone="reject"
            onClick={rejectAll}
            disabled={busy || !reviewed.isSuccess}
            testId="review-reject-file"
          >
            {isNewFile ? "Delete file" : "Reject file"}
          </BarButton>
          <BarButton title="Close review" onClick={exitReview}>
            <X className="h-3.5 w-3.5" />
          </BarButton>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <DiffEditor
          height="100%"
          theme="grokbot-workbench"
          options={DIFF_OPTIONS}
          onMount={handleMount}
          keepCurrentOriginalModel
          keepCurrentModifiedModel
          loading={null}
        />
      </div>
    </div>
  );
}

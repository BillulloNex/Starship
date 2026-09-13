import type { editor, IDisposable } from "monaco-editor";
import type { Monaco } from "@monaco-editor/react";
import { computeMinimalEdit } from "./text-diff";

/**
 * The IDE's open documents: one Monaco text model per workspace file.
 *
 * Models outlive the editor widget, tab switches, and Agent ↔ IDE toggles,
 * so unsaved edits, undo history, and view state are never thrown away when
 * the file is re-read. Disk content flows in through `sync`; the model is
 * only overwritten when it has no unsaved edits. If the file changed on disk
 * while the user was editing, the document is flagged as a conflict instead.
 */

export type SyncResult =
  | "created"
  | "unchanged"
  | "reloaded"
  | "converged"
  | "conflict";

export interface DocumentCallbacks {
  onDirtyChange: (workspaceKey: string, path: string, dirty: boolean) => void;
  onConflictChange: (
    workspaceKey: string,
    path: string,
    hasConflict: boolean,
  ) => void;
}

/** The subset of the Monaco API the document registry needs. */
export type DocumentsMonaco = Pick<Monaco, "Uri" | "Range"> & {
  editor: Pick<Monaco["editor"], "getModel" | "createModel">;
};

interface DocumentState {
  workspaceKey: string;
  path: string;
  model: editor.ITextModel;
  /** The last content known to be on disk. */
  baseline: string;
  /** Model alternative version id that corresponds to `baseline`. */
  savedVersionId: number;
  /** Disk content that diverged from `baseline` while the buffer was dirty. */
  conflictDiskText: string | null;
  viewState: editor.ICodeEditorViewState | null;
  isDirty: boolean;
  subscription: IDisposable;
}

export interface DocumentSnapshot {
  text: string;
  versionId: number;
}

function documentKey(workspaceKey: string, path: string): string {
  return `${workspaceKey}\u0000${path}`;
}

export function getDocumentUri(
  monaco: Pick<Monaco, "Uri">,
  workspaceKey: string,
  path: string,
) {
  return monaco.Uri.file(`/${encodeURIComponent(workspaceKey)}/${path}`);
}

function replaceModelText(
  monaco: Pick<Monaco, "Range">,
  model: editor.ITextModel,
  nextText: string,
) {
  const edit = computeMinimalEdit(model.getValue(), nextText);
  if (!edit) return;
  const range = monaco.Range.fromPositions(
    model.getPositionAt(edit.start),
    model.getPositionAt(edit.end),
  );
  model.pushStackElement();
  model.pushEditOperations([], [{ range, text: edit.text }], () => null);
  model.pushStackElement();
}

export class WorkbenchDocuments {
  private readonly docs = new Map<string, DocumentState>();

  private monaco: DocumentsMonaco | null = null;

  constructor(private readonly callbacks: DocumentCallbacks) {}

  private find(workspaceKey: string, path: string) {
    return this.docs.get(documentKey(workspaceKey, path));
  }

  private setDirty(doc: DocumentState, dirty: boolean) {
    if (doc.isDirty === dirty) return;
    // eslint-disable-next-line no-param-reassign
    doc.isDirty = dirty;
    this.callbacks.onDirtyChange(doc.workspaceKey, doc.path, dirty);
  }

  private setConflict(doc: DocumentState, diskText: string | null) {
    const had = doc.conflictDiskText !== null;
    // eslint-disable-next-line no-param-reassign
    doc.conflictDiskText = diskText;
    if (had !== (diskText !== null)) {
      this.callbacks.onConflictChange(
        doc.workspaceKey,
        doc.path,
        diskText !== null,
      );
    }
  }

  private refreshDirty(doc: DocumentState) {
    this.setDirty(
      doc,
      doc.model.getAlternativeVersionId() !== doc.savedVersionId,
    );
  }

  has(workspaceKey: string, path: string): boolean {
    return this.docs.has(documentKey(workspaceKey, path));
  }

  getModel(workspaceKey: string, path: string): editor.ITextModel | null {
    return this.find(workspaceKey, path)?.model ?? null;
  }

  /** Reverse lookup used by editor events that only know the model. */
  getPathForModel(model: editor.ITextModel | null): string | null {
    if (!model) return null;
    for (const doc of this.docs.values()) {
      if (doc.model === model) return doc.path;
    }
    return null;
  }

  /**
   * Brings the document in line with `diskText`, creating its model on
   * first sight. Unsaved edits are never overwritten.
   */
  sync(
    monaco: DocumentsMonaco,
    workspaceKey: string,
    path: string,
    diskText: string,
    language?: string,
  ): SyncResult {
    this.monaco = monaco;
    const existing = this.find(workspaceKey, path);

    if (!existing || existing.model.isDisposed()) {
      const uri = getDocumentUri(monaco, workspaceKey, path);
      const model =
        monaco.editor.getModel(uri) ??
        monaco.editor.createModel(diskText, language, uri);
      if (model.getValue() !== diskText) model.setValue(diskText);

      const doc: DocumentState = {
        workspaceKey,
        path,
        model,
        baseline: diskText,
        savedVersionId: model.getAlternativeVersionId(),
        conflictDiskText: null,
        viewState: null,
        isDirty: false,
        subscription: model.onDidChangeContent(() => this.refreshDirty(doc)),
      };
      this.docs.set(documentKey(workspaceKey, path), doc);
      return "created";
    }

    const doc = existing;
    if (diskText === doc.baseline) {
      // Disk went back to what we last saw — any earlier conflict is moot.
      this.setConflict(doc, null);
      return "unchanged";
    }

    if (!doc.isDirty) {
      replaceModelText(monaco, doc.model, diskText);
      doc.baseline = diskText;
      doc.savedVersionId = doc.model.getAlternativeVersionId();
      this.refreshDirty(doc);
      this.setConflict(doc, null);
      return "reloaded";
    }

    if (doc.model.getValue() === diskText) {
      // The user's edits already match what landed on disk.
      doc.baseline = diskText;
      doc.savedVersionId = doc.model.getAlternativeVersionId();
      this.refreshDirty(doc);
      this.setConflict(doc, null);
      return "converged";
    }

    this.setConflict(doc, diskText);
    return "conflict";
  }

  isDirty(workspaceKey: string, path: string): boolean {
    return this.find(workspaceKey, path)?.isDirty ?? false;
  }

  getBaseline(workspaceKey: string, path: string): string | null {
    return this.find(workspaceKey, path)?.baseline ?? null;
  }

  getConflict(workspaceKey: string, path: string): string | null {
    return this.find(workspaceKey, path)?.conflictDiskText ?? null;
  }

  snapshot(workspaceKey: string, path: string): DocumentSnapshot | null {
    const doc = this.find(workspaceKey, path);
    if (!doc) return null;
    return {
      text: doc.model.getValue(),
      versionId: doc.model.getAlternativeVersionId(),
    };
  }

  /**
   * Records that `snapshot` was written to disk. Edits typed while the save
   * was in flight keep the document dirty.
   */
  markSaved(workspaceKey: string, path: string, snapshot: DocumentSnapshot) {
    const doc = this.find(workspaceKey, path);
    if (!doc) return;
    doc.baseline = snapshot.text;
    doc.savedVersionId = snapshot.versionId;
    this.refreshDirty(doc);
    this.setConflict(doc, null);
  }

  /** Flags that disk content diverged from the buffer (e.g. found at save). */
  flagConflict(workspaceKey: string, path: string, diskText: string) {
    const doc = this.find(workspaceKey, path);
    if (!doc) return;
    if (diskText === doc.baseline) {
      this.setConflict(doc, null);
      return;
    }
    this.setConflict(doc, diskText);
  }

  /**
   * Keeps the buffer and accepts the disk content as the new baseline, so
   * the next save overwrites it.
   */
  keepMine(workspaceKey: string, path: string) {
    const doc = this.find(workspaceKey, path);
    if (doc?.conflictDiskText == null) return;
    doc.baseline = doc.conflictDiskText;
    this.setConflict(doc, null);
  }

  /** Discards unsaved edits and loads the disk content. */
  takeDisk(workspaceKey: string, path: string) {
    const doc = this.find(workspaceKey, path);
    if (doc?.conflictDiskText == null || !this.monaco) return;
    const diskText = doc.conflictDiskText;
    replaceModelText(this.monaco, doc.model, diskText);
    doc.baseline = diskText;
    doc.savedVersionId = doc.model.getAlternativeVersionId();
    this.refreshDirty(doc);
    this.setConflict(doc, null);
  }

  /**
   * Replaces the buffer's content as an undoable edit (e.g. rejecting a
   * change during review). The document becomes dirty until saved.
   */
  replaceContent(workspaceKey: string, path: string, text: string) {
    const doc = this.find(workspaceKey, path);
    if (!doc || !this.monaco) return;
    replaceModelText(this.monaco, doc.model, text);
  }

  saveViewState(
    workspaceKey: string,
    path: string,
    viewState: editor.ICodeEditorViewState | null,
  ) {
    const doc = this.find(workspaceKey, path);
    if (doc) doc.viewState = viewState;
  }

  getViewState(
    workspaceKey: string,
    path: string,
  ): editor.ICodeEditorViewState | null {
    return this.find(workspaceKey, path)?.viewState ?? null;
  }

  /** Disposes a document's model. Refuses while it has unsaved edits. */
  close(workspaceKey: string, path: string, { force = false } = {}): boolean {
    const doc = this.find(workspaceKey, path);
    if (!doc) return true;
    if (doc.isDirty && !force) return false;
    doc.subscription.dispose();
    if (!doc.model.isDisposed()) doc.model.dispose();
    this.docs.delete(documentKey(workspaceKey, path));
    this.setDirty(doc, false);
    this.setConflict(doc, null);
    return true;
  }

  /** Frees clean documents that belong to other workspaces. */
  closeCleanOutside(workspaceKey: string) {
    for (const doc of [...this.docs.values()]) {
      if (doc.workspaceKey !== workspaceKey && !doc.isDirty) {
        this.close(doc.workspaceKey, doc.path);
      }
    }
  }

  dirtyPaths(workspaceKey?: string): string[] {
    const paths: string[] = [];
    for (const doc of this.docs.values()) {
      if (
        doc.isDirty &&
        (workspaceKey === undefined || doc.workspaceKey === workspaceKey)
      ) {
        paths.push(doc.path);
      }
    }
    return paths;
  }
}

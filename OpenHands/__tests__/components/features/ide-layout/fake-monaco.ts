import type { DocumentsMonaco } from "#/components/features/ide-layout/workbench/documents";

/**
 * Minimal stand-in for Monaco's text model. Positions are encoded as
 * `{ lineNumber: 1, column: offset + 1 }` so ranges map back to offsets.
 */
export class FakeModel {
  private value: string;

  private versionId = 1;

  private disposed = false;

  private listeners: (() => void)[] = [];

  constructor(value: string) {
    this.value = value;
  }

  getValue() {
    return this.value;
  }

  setValue(value: string) {
    this.value = value;
    this.versionId += 1;
    this.listeners.forEach((listener) => listener());
  }

  getAlternativeVersionId() {
    return this.versionId;
  }

  getPositionAt(offset: number) {
    return { lineNumber: 1, column: offset + 1 };
  }

  pushStackElement() {}

  pushEditOperations(
    _before: unknown,
    edits: { range: { start: number; end: number }; text: string }[],
  ) {
    const [{ range, text }] = edits;
    this.setValue(
      this.value.slice(0, range.start) + text + this.value.slice(range.end),
    );
    return null;
  }

  /** Simulates the user typing. */
  type(value: string) {
    this.setValue(value);
  }

  onDidChangeContent(listener: () => void) {
    this.listeners.push(listener);
    return {
      dispose: () => {
        this.listeners = this.listeners.filter((l) => l !== listener);
      },
    };
  }

  isDisposed() {
    return this.disposed;
  }

  dispose() {
    this.disposed = true;
  }
}

export function createFakeMonaco() {
  const models = new Map<string, FakeModel>();
  const monaco = {
    Uri: { file: (path: string) => ({ path, toString: () => path }) },
    Range: {
      fromPositions: (start: { column: number }, end: { column: number }) => ({
        start: start.column - 1,
        end: end.column - 1,
      }),
    },
    editor: {
      getModel: (uri: { path: string }) => models.get(uri.path) ?? null,
      createModel: (
        value: string,
        _language: unknown,
        uri: { path: string },
      ) => {
        const model = new FakeModel(value);
        models.set(uri.path, model);
        return model;
      },
    },
  };
  return { monaco: monaco as unknown as DocumentsMonaco, models };
}

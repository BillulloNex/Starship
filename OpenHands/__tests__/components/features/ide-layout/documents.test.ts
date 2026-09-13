import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  WorkbenchDocuments,
  type DocumentCallbacks,
  type DocumentsMonaco,
} from "#/components/features/ide-layout/workbench/documents";
import { createFakeMonaco, type FakeModel } from "./fake-monaco";

describe("WorkbenchDocuments", () => {
  const WS = "conv-1";
  let onDirtyChange: ReturnType<
    typeof vi.fn<DocumentCallbacks["onDirtyChange"]>
  >;
  let onConflictChange: ReturnType<
    typeof vi.fn<DocumentCallbacks["onConflictChange"]>
  >;
  let docs: WorkbenchDocuments;
  let monaco: DocumentsMonaco;

  const modelFor = (path: string) =>
    docs.getModel(WS, path) as unknown as FakeModel;

  beforeEach(() => {
    onDirtyChange = vi.fn<DocumentCallbacks["onDirtyChange"]>();
    onConflictChange = vi.fn<DocumentCallbacks["onConflictChange"]>();
    docs = new WorkbenchDocuments({ onDirtyChange, onConflictChange });
    ({ monaco } = createFakeMonaco());
  });

  it("creates a clean model on first sync", () => {
    expect(docs.sync(monaco, WS, "a.ts", "one")).toBe("created");
    expect(modelFor("a.ts").getValue()).toBe("one");
    expect(docs.isDirty(WS, "a.ts")).toBe(false);
  });

  it("tracks dirty state as the user types", () => {
    docs.sync(monaco, WS, "a.ts", "one");
    modelFor("a.ts").type("one!");
    expect(docs.isDirty(WS, "a.ts")).toBe(true);
    expect(onDirtyChange).toHaveBeenLastCalledWith(WS, "a.ts", true);
  });

  it("reloads a clean buffer when the disk changes", () => {
    docs.sync(monaco, WS, "a.ts", "const a = 1;");
    expect(docs.sync(monaco, WS, "a.ts", "const a = 2;")).toBe("reloaded");
    expect(modelFor("a.ts").getValue()).toBe("const a = 2;");
    expect(docs.isDirty(WS, "a.ts")).toBe(false);
  });

  it("never overwrites unsaved edits when the disk changes", () => {
    docs.sync(monaco, WS, "a.ts", "base");
    modelFor("a.ts").type("mine");

    expect(docs.sync(monaco, WS, "a.ts", "theirs")).toBe("conflict");
    expect(modelFor("a.ts").getValue()).toBe("mine");
    expect(docs.getConflict(WS, "a.ts")).toBe("theirs");
    expect(onConflictChange).toHaveBeenLastCalledWith(WS, "a.ts", true);
  });

  it("ignores re-reads that match what was loaded", () => {
    docs.sync(monaco, WS, "a.ts", "base");
    modelFor("a.ts").type("mine");
    expect(docs.sync(monaco, WS, "a.ts", "base")).toBe("unchanged");
    expect(modelFor("a.ts").getValue()).toBe("mine");
  });

  it("clears dirty state when the disk already matches the buffer", () => {
    docs.sync(monaco, WS, "a.ts", "base");
    modelFor("a.ts").type("same");
    expect(docs.sync(monaco, WS, "a.ts", "same")).toBe("converged");
    expect(docs.isDirty(WS, "a.ts")).toBe(false);
  });

  it("keeps edits typed while a save was in flight dirty", () => {
    docs.sync(monaco, WS, "a.ts", "base");
    const model = modelFor("a.ts");
    model.type("saved");
    const snapshot = docs.snapshot(WS, "a.ts")!;
    model.type("saved + more");

    docs.markSaved(WS, "a.ts", snapshot);
    expect(docs.getBaseline(WS, "a.ts")).toBe("saved");
    expect(docs.isDirty(WS, "a.ts")).toBe(true);
  });

  it("resolves a conflict by keeping the buffer", () => {
    docs.sync(monaco, WS, "a.ts", "base");
    modelFor("a.ts").type("mine");
    docs.sync(monaco, WS, "a.ts", "theirs");

    docs.keepMine(WS, "a.ts");
    expect(docs.getConflict(WS, "a.ts")).toBeNull();
    expect(docs.getBaseline(WS, "a.ts")).toBe("theirs");
    expect(modelFor("a.ts").getValue()).toBe("mine");
    expect(docs.isDirty(WS, "a.ts")).toBe(true);
  });

  it("resolves a conflict by taking the disk version", () => {
    docs.sync(monaco, WS, "a.ts", "base");
    modelFor("a.ts").type("mine");
    docs.sync(monaco, WS, "a.ts", "theirs");

    docs.takeDisk(WS, "a.ts");
    expect(modelFor("a.ts").getValue()).toBe("theirs");
    expect(docs.isDirty(WS, "a.ts")).toBe(false);
    expect(docs.getConflict(WS, "a.ts")).toBeNull();
  });

  it("refuses to close a dirty document unless forced", () => {
    docs.sync(monaco, WS, "a.ts", "base");
    const model = modelFor("a.ts");
    model.type("mine");

    expect(docs.close(WS, "a.ts")).toBe(false);
    expect(docs.has(WS, "a.ts")).toBe(true);
    expect(docs.close(WS, "a.ts", { force: true })).toBe(true);
    expect(model.isDisposed()).toBe(true);
    expect(docs.has(WS, "a.ts")).toBe(false);
  });

  it("keeps workspaces apart and frees clean documents from others", () => {
    docs.sync(monaco, WS, "a.ts", "one");
    docs.sync(monaco, "conv-2", "a.ts", "two");
    docs.sync(monaco, "conv-2", "b.ts", "dirty");
    (docs.getModel("conv-2", "b.ts") as unknown as FakeModel).type("edited");

    expect(docs.getModel(WS, "a.ts")).not.toBe(docs.getModel("conv-2", "a.ts"));

    docs.closeCleanOutside(WS);
    expect(docs.has("conv-2", "a.ts")).toBe(false);
    expect(docs.has("conv-2", "b.ts")).toBe(true);
    expect(docs.has(WS, "a.ts")).toBe(true);
    expect(docs.dirtyPaths()).toEqual(["b.ts"]);
  });

  it("maps a model back to its path", () => {
    docs.sync(monaco, WS, "src/a.ts", "one");
    expect(docs.getPathForModel(docs.getModel(WS, "src/a.ts"))).toBe(
      "src/a.ts",
    );
    expect(docs.getPathForModel(null)).toBeNull();
  });
});

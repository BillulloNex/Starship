import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFilesTabStore } from "#/stores/files-tab-store";
import { useWorkbenchStore } from "#/stores/workbench-store";
import { workbenchDocuments } from "#/components/features/ide-layout/workbench/document-registry";
import { useWorkbenchSave } from "#/components/features/ide-layout/workbench/use-workbench-save";
import { createFakeMonaco, type FakeModel } from "./fake-monaco";

const readFile = vi.fn();
const saveFile = vi.fn();

vi.mock("#/context/workspace-runtime-context", () => ({
  useWorkspaceRuntime: () => ({ workspaceKey: "ws" }),
}));

vi.mock("#/hooks/query/use-workspace-file-content", () => ({
  useWorkspaceFileReader: () => readFile,
}));

vi.mock("#/hooks/mutation/use-workspace-file-mutations", () => ({
  useSaveWorkspaceFile: () => ({ mutateAsync: saveFile }),
}));

const PATH = "src/app.ts";

function openDocument(diskText: string) {
  const { monaco } = createFakeMonaco();
  workbenchDocuments.sync(monaco, "ws", PATH, diskText);
  return workbenchDocuments.getModel("ws", PATH) as unknown as FakeModel;
}

describe("useWorkbenchSave", () => {
  beforeEach(() => {
    workbenchDocuments.close("ws", PATH, { force: true });
    readFile.mockReset();
    saveFile.mockReset().mockResolvedValue(PATH);
    useFilesTabStore.setState({ selectedConversationId: "ws" });
  });

  it("skips clean documents", async () => {
    openDocument("base");
    const { result } = renderHook(() => useWorkbenchSave());
    await act(async () => {
      expect(await result.current(PATH)).toBe("clean");
    });
    expect(saveFile).not.toHaveBeenCalled();
  });

  it("saves the buffer when the disk still matches what was loaded", async () => {
    const model = openDocument("base");
    model.type("edited");
    readFile.mockResolvedValue({ text: "base" });

    const { result } = renderHook(() => useWorkbenchSave());
    await act(async () => {
      expect(await result.current(PATH)).toBe("saved");
    });

    expect(saveFile).toHaveBeenCalledWith({
      path: PATH,
      content: "edited",
      source: "editor",
    });
    expect(workbenchDocuments.isDirty("ws", PATH)).toBe(false);
    expect(useFilesTabStore.getState().dirtyFiles[PATH]).toBeUndefined();
  });

  it("refuses to clobber a file that changed on disk", async () => {
    const model = openDocument("base");
    model.type("mine");
    readFile.mockResolvedValue({ text: "agent wrote this" });

    const { result } = renderHook(() => useWorkbenchSave());
    await act(async () => {
      expect(await result.current(PATH)).toBe("conflict");
    });

    expect(saveFile).not.toHaveBeenCalled();
    expect(workbenchDocuments.getConflict("ws", PATH)).toBe("agent wrote this");
    expect(useWorkbenchStore.getState().conflicts[PATH]).toBe(true);
  });

  it("overwrites when explicitly asked", async () => {
    const model = openDocument("base");
    model.type("mine");
    readFile.mockResolvedValue({ text: "agent wrote this" });

    const { result } = renderHook(() => useWorkbenchSave());
    await act(async () => {
      expect(await result.current(PATH, { overwrite: true })).toBe("saved");
    });

    expect(readFile).not.toHaveBeenCalled();
    expect(saveFile).toHaveBeenCalledWith(
      expect.objectContaining({ content: "mine" }),
    );
  });

  it("keeps the document dirty when the save fails", async () => {
    const model = openDocument("base");
    model.type("mine");
    readFile.mockResolvedValue({ text: "base" });
    saveFile.mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() => useWorkbenchSave());
    await act(async () => {
      expect(await result.current(PATH)).toBe("failed");
    });
    expect(workbenchDocuments.isDirty("ws", PATH)).toBe(true);
  });

  it("coalesces concurrent saves of the same file", async () => {
    const model = openDocument("base");
    model.type("mine");
    readFile.mockResolvedValue({ text: "base" });

    const { result } = renderHook(() => useWorkbenchSave());
    await act(async () => {
      await Promise.all([result.current(PATH), result.current(PATH)]);
    });
    expect(saveFile).toHaveBeenCalledTimes(1);
  });
});

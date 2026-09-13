import { describe, it, expect, vi, beforeEach } from "vitest";
import AgentServerRuntimeService from "#/api/runtime-service/agent-server-runtime-service";
import { WorkspaceFileOperationsService } from "#/api/runtime-service/workspace-file-operations.service";

describe("WorkspaceFileOperationsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls executeCommand with python script to create a file", async () => {
    const executeSpy = vi
      .spyOn(AgentServerRuntimeService, "executeCommand")
      .mockResolvedValueOnce({
        exit_code: 0,
        stdout: "",
        stderr: "",
      });

    const result = await WorkspaceFileOperationsService.createFile(
      "http://localhost:18000",
      "test-key",
      "/workspace",
      "src/test.ts",
      "console.log('hello')",
    );

    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(executeSpy).toHaveBeenCalledWith(
      "http://localhost:18000",
      "test-key",
      expect.stringContaining("python3 -c"),
      "/workspace",
      15,
    );
    expect(result.exit_code).toBe(0);
  });

  it("calls executeCommand with python script to create a folder", async () => {
    const executeSpy = vi
      .spyOn(AgentServerRuntimeService, "executeCommand")
      .mockResolvedValueOnce({
        exit_code: 0,
        stdout: "",
        stderr: "",
      });

    const result = await WorkspaceFileOperationsService.createFolder(
      "http://localhost:18000",
      "test-key",
      "/workspace",
      "src/components",
    );

    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(executeSpy).toHaveBeenCalledWith(
      "http://localhost:18000",
      "test-key",
      expect.stringContaining("p.mkdir"),
      "/workspace",
      15,
    );
    expect(result.exit_code).toBe(0);
  });

  it("calls executeCommand with python script to delete a target path", async () => {
    const executeSpy = vi
      .spyOn(AgentServerRuntimeService, "executeCommand")
      .mockResolvedValueOnce({
        exit_code: 0,
        stdout: "",
        stderr: "",
      });

    const result = await WorkspaceFileOperationsService.deletePath(
      "http://localhost:18000",
      "test-key",
      "/workspace",
      "src/obsolete.ts",
    );

    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(executeSpy).toHaveBeenCalledWith(
      "http://localhost:18000",
      "test-key",
      expect.stringContaining("shutil.rmtree"),
      "/workspace",
      15,
    );
    expect(result.exit_code).toBe(0);
  });

  it("calls executeCommand with python script to rename a target path", async () => {
    const executeSpy = vi
      .spyOn(AgentServerRuntimeService, "executeCommand")
      .mockResolvedValueOnce({
        exit_code: 0,
        stdout: "",
        stderr: "",
      });

    const result = await WorkspaceFileOperationsService.renamePath(
      "http://localhost:18000",
      "test-key",
      "/workspace",
      "src/old.ts",
      "src/new.ts",
    );

    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(executeSpy).toHaveBeenCalledWith(
      "http://localhost:18000",
      "test-key",
      expect.stringContaining("shutil.move"),
      "/workspace",
      15,
    );
    expect(result.exit_code).toBe(0);
  });
});

describe("WorkspaceFileOperationsService.saveFileContent", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const ok = { exit_code: 0, stdout: "", stderr: "" };

  it("writes small files with a single command", async () => {
    const executeSpy = vi
      .spyOn(AgentServerRuntimeService, "executeCommand")
      .mockResolvedValue(ok);

    await WorkspaceFileOperationsService.saveFileContent(
      "http://localhost:18000",
      "test-key",
      "/workspace",
      "src/small.ts",
      "export const a = 1;\n",
    );

    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(executeSpy.mock.calls[0][2]).toContain("p.write_text");
  });

  it("streams large files in bounded chunks and moves them into place", async () => {
    const executeSpy = vi
      .spyOn(AgentServerRuntimeService, "executeCommand")
      .mockResolvedValue(ok);
    const content = "x".repeat(250_000);

    await WorkspaceFileOperationsService.saveFileContent(
      "http://localhost:18000",
      "test-key",
      "/workspace",
      "src/big.json",
      content,
    );

    const scripts = executeSpy.mock.calls.map((call) => call[2]);
    // 250KB → ~333KB of base64 → 4 chunks + a final atomic replace.
    expect(scripts).toHaveLength(5);
    scripts.forEach((script) => {
      // Stay under the kernel's 128KB per-argument limit.
      expect(script.length).toBeLessThan(131_072);
    });
    expect(scripts[0]).toContain("open(t, 'wb')");
    expect(scripts[1]).toContain("open(t, 'ab')");
    expect(scripts[4]).toContain("os.replace(t, p)");
  });

  it("stops before replacing the file when a chunk fails", async () => {
    const executeSpy = vi
      .spyOn(AgentServerRuntimeService, "executeCommand")
      .mockResolvedValueOnce(ok)
      .mockResolvedValueOnce({ exit_code: 1, stdout: "", stderr: "disk full" });

    const result = await WorkspaceFileOperationsService.saveFileContent(
      "http://localhost:18000",
      "test-key",
      "/workspace",
      "src/big.json",
      "y".repeat(250_000),
    );

    expect(result.exit_code).toBe(1);
    expect(executeSpy).toHaveBeenCalledTimes(2);
    expect(
      executeSpy.mock.calls.some((call) => call[2].includes("os.replace")),
    ).toBe(false);
  });
});

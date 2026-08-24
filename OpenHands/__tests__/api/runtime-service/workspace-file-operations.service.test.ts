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

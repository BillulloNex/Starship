import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

import { WorkspaceFileOperationsService } from "#/api/runtime-service/workspace-file-operations.service";
import { useWorkspaceRuntime } from "#/context/workspace-runtime-context";
import { useWorkspaceMutationCounter } from "#/stores/use-workspace-mutation-counter";

function useWorkspaceContext() {
  const { conversationUrl, sessionApiKey, workingDir } = useWorkspaceRuntime();
  return { conversationUrl, sessionApiKey, workingDir };
}

export function useCreateWorkspaceFile() {
  const queryClient = useQueryClient();
  const { conversationUrl, sessionApiKey, workingDir } = useWorkspaceContext();
  const bumpWorkspaceMutationCounter = useWorkspaceMutationCounter(
    (state) => state.bump,
  );

  return useMutation({
    mutationFn: async ({
      path,
      content = "",
    }: {
      path: string;
      content?: string;
    }) => {
      const cleanPath = path.trim().replace(/^\/+/, "");
      if (!cleanPath) throw new Error("File path cannot be empty");

      const result = await WorkspaceFileOperationsService.createFile(
        conversationUrl,
        sessionApiKey,
        workingDir,
        cleanPath,
        content,
      );

      if (result.exit_code !== 0) {
        throw new Error(result.stderr?.trim() || "Failed to create file");
      }

      return cleanPath;
    },
    onSuccess: (createdPath) => {
      queryClient.invalidateQueries({ queryKey: ["workspace-files"] });
      queryClient.invalidateQueries({ queryKey: ["workspace-file-content"] });
      queryClient.invalidateQueries({ queryKey: ["file_changes"] });
      queryClient.invalidateQueries({ queryKey: ["file_diff"] });
      bumpWorkspaceMutationCounter();
      toast.success(`Created file ${createdPath}`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create file");
    },
  });
}

export function useCreateWorkspaceFolder() {
  const queryClient = useQueryClient();
  const { conversationUrl, sessionApiKey, workingDir } = useWorkspaceContext();
  const bumpWorkspaceMutationCounter = useWorkspaceMutationCounter(
    (state) => state.bump,
  );

  return useMutation({
    mutationFn: async (folderPath: string) => {
      const cleanPath = folderPath.trim().replace(/^\/+/, "");
      if (!cleanPath) throw new Error("Folder path cannot be empty");

      const result = await WorkspaceFileOperationsService.createFolder(
        conversationUrl,
        sessionApiKey,
        workingDir,
        cleanPath,
      );

      if (result.exit_code !== 0) {
        throw new Error(result.stderr?.trim() || "Failed to create folder");
      }

      return cleanPath;
    },
    onSuccess: (createdPath) => {
      queryClient.invalidateQueries({ queryKey: ["workspace-files"] });
      bumpWorkspaceMutationCounter();
      toast.success(`Created folder ${createdPath}`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create folder");
    },
  });
}

export function useSaveWorkspaceFile() {
  const queryClient = useQueryClient();
  const { conversationUrl, sessionApiKey, workingDir } = useWorkspaceContext();
  const bumpWorkspaceMutationCounter = useWorkspaceMutationCounter(
    (state) => state.bump,
  );

  return useMutation({
    mutationFn: async ({
      path,
      content,
    }: {
      path: string;
      content: string;
    }) => {
      const cleanPath = path.trim().replace(/^\/+/, "");
      if (!cleanPath) throw new Error("File path cannot be empty");

      const result = await WorkspaceFileOperationsService.saveFileContent(
        conversationUrl,
        sessionApiKey,
        workingDir,
        cleanPath,
        content,
      );

      if (result.exit_code !== 0) {
        throw new Error(result.stderr?.trim() || "Failed to save file");
      }

      return cleanPath;
    },
    onSuccess: (savedPath) => {
      queryClient.invalidateQueries({ queryKey: ["workspace-files"] });
      queryClient.invalidateQueries({ queryKey: ["workspace-file-content"] });
      queryClient.invalidateQueries({ queryKey: ["file_changes"] });
      queryClient.invalidateQueries({ queryKey: ["file_diff"] });
      bumpWorkspaceMutationCounter();
      toast.success(`Saved ${savedPath}`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to save file");
    },
  });
}

export function useDeleteWorkspacePath() {
  const queryClient = useQueryClient();
  const { conversationUrl, sessionApiKey, workingDir } = useWorkspaceContext();
  const bumpWorkspaceMutationCounter = useWorkspaceMutationCounter(
    (state) => state.bump,
  );

  return useMutation({
    mutationFn: async ({
      path,
      isDirectory,
    }: {
      path: string;
      isDirectory: boolean;
    }) => {
      const cleanPath = path.trim().replace(/^\/+/, "");
      if (!cleanPath) throw new Error("Target path cannot be empty");

      const result = await WorkspaceFileOperationsService.deletePath(
        conversationUrl,
        sessionApiKey,
        workingDir,
        cleanPath,
      );

      if (result.exit_code !== 0) {
        throw new Error(
          result.stderr?.trim() ||
            `Failed to delete ${isDirectory ? "folder" : "file"}`,
        );
      }

      return { path: cleanPath, isDirectory };
    },
    onSuccess: ({ path, isDirectory }) => {
      queryClient.invalidateQueries({ queryKey: ["workspace-files"] });
      queryClient.invalidateQueries({ queryKey: ["workspace-file-content"] });
      queryClient.invalidateQueries({ queryKey: ["file_changes"] });
      queryClient.invalidateQueries({ queryKey: ["file_diff"] });
      bumpWorkspaceMutationCounter();
      toast.success(`Deleted ${isDirectory ? "folder" : "file"} ${path}`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete target");
    },
  });
}

export function useRenameWorkspacePath() {
  const queryClient = useQueryClient();
  const { conversationUrl, sessionApiKey, workingDir } = useWorkspaceContext();
  const bumpWorkspaceMutationCounter = useWorkspaceMutationCounter(
    (state) => state.bump,
  );

  return useMutation({
    mutationFn: async ({
      oldPath,
      newPath,
    }: {
      oldPath: string;
      newPath: string;
    }) => {
      const cleanOld = oldPath.trim().replace(/^\/+/, "");
      const cleanNew = newPath.trim().replace(/^\/+/, "");
      if (!cleanOld || !cleanNew) throw new Error("Path cannot be empty");

      const result = await WorkspaceFileOperationsService.renamePath(
        conversationUrl,
        sessionApiKey,
        workingDir,
        cleanOld,
        cleanNew,
      );

      if (result.exit_code !== 0) {
        throw new Error(result.stderr?.trim() || "Failed to rename path");
      }

      return { oldPath: cleanOld, newPath: cleanNew };
    },
    onSuccess: ({ oldPath, newPath }) => {
      queryClient.invalidateQueries({ queryKey: ["workspace-files"] });
      queryClient.invalidateQueries({ queryKey: ["workspace-file-content"] });
      queryClient.invalidateQueries({ queryKey: ["file_changes"] });
      queryClient.invalidateQueries({ queryKey: ["file_diff"] });
      bumpWorkspaceMutationCounter();
      toast.success(`Renamed ${oldPath} to ${newPath}`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to rename path");
    },
  });
}

export function useDuplicateWorkspacePath() {
  const queryClient = useQueryClient();
  const { conversationUrl, sessionApiKey, workingDir } = useWorkspaceContext();
  const bumpWorkspaceMutationCounter = useWorkspaceMutationCounter(
    (state) => state.bump,
  );

  return useMutation({
    mutationFn: async ({
      sourcePath,
      targetPath,
    }: {
      sourcePath: string;
      targetPath: string;
    }) => {
      const cleanSource = sourcePath.trim().replace(/^\/+/, "");
      const cleanTarget = targetPath.trim().replace(/^\/+/, "");
      if (!cleanSource || !cleanTarget) throw new Error("Path cannot be empty");

      const result = await WorkspaceFileOperationsService.duplicatePath(
        conversationUrl,
        sessionApiKey,
        workingDir,
        cleanSource,
        cleanTarget,
      );

      if (result.exit_code !== 0) {
        throw new Error(result.stderr?.trim() || "Failed to duplicate path");
      }

      return { sourcePath: cleanSource, targetPath: cleanTarget };
    },
    onSuccess: ({ targetPath }) => {
      queryClient.invalidateQueries({ queryKey: ["workspace-files"] });
      queryClient.invalidateQueries({ queryKey: ["workspace-file-content"] });
      queryClient.invalidateQueries({ queryKey: ["file_changes"] });
      queryClient.invalidateQueries({ queryKey: ["file_diff"] });
      bumpWorkspaceMutationCounter();
      toast.success(`Duplicated to ${targetPath}`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to duplicate file");
    },
  });
}

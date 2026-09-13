import { useMemo } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useWorkspaceRuntime } from "#/context/workspace-runtime-context";
import { getActiveBackend } from "#/api/backend-registry/active-store";
import {
  acceptAll,
  acceptFile,
  listReviewChanges,
  readReviewedVersion,
  rejectFile,
  writeReviewedVersion,
} from "#/api/runtime-service/workspace-review.service";
import { useWorkspaceMutationCounter } from "#/stores/use-workspace-mutation-counter";

function useReviewTarget() {
  const {
    conversationUrl,
    sessionApiKey,
    workingDir,
    conversationId,
    isReady,
  } = useWorkspaceRuntime();
  const target = useMemo(
    () => ({ conversationUrl, sessionApiKey, workingDir }),
    [conversationUrl, sessionApiKey, workingDir],
  );
  const isCloud = getActiveBackend().backend.kind === "cloud";
  return { target, conversationId, isReady: isReady && !isCloud };
}

/** Unreviewed (unstaged) changes in the workspace, for the Review panel. */
export function useReviewChanges() {
  const { target, conversationId, isReady } = useReviewTarget();
  const mutationCount = useWorkspaceMutationCounter((s) => s.count);

  return useQuery({
    queryKey: [
      "workspace-review",
      "changes",
      conversationId,
      target,
      mutationCount,
    ],
    queryFn: () => listReviewChanges(target),
    enabled: isReady,
    placeholderData: (previous) => previous,
    refetchOnWindowFocus: true,
    retry: false,
    meta: { disableToast: true },
  });
}

/** The reviewed (staged or committed) version of a file. */
export function useReviewedVersion(path: string | null) {
  const { target, conversationId, isReady } = useReviewTarget();

  return useQuery({
    queryKey: ["workspace-review", "original", conversationId, target, path],
    queryFn: () => readReviewedVersion(target, path!),
    enabled: isReady && !!path,
    retry: false,
    meta: { disableToast: true },
  });
}

function afterReviewChange(queryClient: QueryClient, touchedDisk: boolean) {
  queryClient.invalidateQueries({ queryKey: ["workspace-review"] });
  queryClient.invalidateQueries({ queryKey: ["file_changes"] });
  queryClient.invalidateQueries({ queryKey: ["file_diff"] });
  if (touchedDisk) {
    queryClient.invalidateQueries({ queryKey: ["workspace-files"] });
    queryClient.invalidateQueries({ queryKey: ["workspace-file-content"] });
    useWorkspaceMutationCounter.getState().bump();
  }
}

export function useReviewActions() {
  const queryClient = useQueryClient();
  const { target } = useReviewTarget();

  const onError = (error: Error) => toast.error(error.message);

  const acceptFileMutation = useMutation({
    mutationFn: (path: string) => acceptFile(target, path),
    onSuccess: () => afterReviewChange(queryClient, false),
    onError,
  });
  const acceptAllMutation = useMutation({
    mutationFn: () => acceptAll(target),
    onSuccess: () => afterReviewChange(queryClient, false),
    onError,
  });
  const rejectFileMutation = useMutation({
    mutationFn: (path: string) => rejectFile(target, path),
    onSuccess: () => afterReviewChange(queryClient, true),
    onError,
  });
  const writeReviewedMutation = useMutation({
    mutationFn: ({ path, content }: { path: string; content: string }) =>
      writeReviewedVersion(target, path, content),
    onSuccess: () => afterReviewChange(queryClient, false),
    onError,
  });

  return {
    acceptFile: acceptFileMutation.mutateAsync,
    acceptAll: acceptAllMutation.mutateAsync,
    rejectFile: rejectFileMutation.mutateAsync,
    writeReviewedVersion: writeReviewedMutation.mutateAsync,
    isBusy:
      acceptFileMutation.isPending ||
      acceptAllMutation.isPending ||
      rejectFileMutation.isPending ||
      writeReviewedMutation.isPending,
  };
}

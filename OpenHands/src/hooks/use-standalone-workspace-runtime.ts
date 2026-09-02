import { useQuery } from "@tanstack/react-query";

import { getAgentServerWorkingDir } from "#/api/agent-server-config";
import {
  getAgentServerHomeDir,
  resolveAbsoluteAgentServerPath,
} from "#/api/agent-server-home";
import { useActiveBackend } from "#/contexts/active-backend-context";
import type { WorkspaceRuntime } from "#/context/workspace-runtime-context";
import { useWorkspaceRootStore } from "#/stores/workspace-root-store";

export interface WorkspaceRootPreset {
  id: string;
  label: string;
  path: string;
}

const FILESYSTEM_ROOT = "/";

export function useWorkspaceRootPresets() {
  const { backend } = useActiveBackend();

  const query = useQuery({
    queryKey: ["workspace-root-presets", backend.id],
    queryFn: async (): Promise<{
      defaultRoot: string;
      presets: WorkspaceRootPreset[];
    }> => {
      const workspaceBase = await resolveAbsoluteAgentServerPath(
        getAgentServerWorkingDir(),
      );
      const homeDir = await getAgentServerHomeDir();

      const presets: WorkspaceRootPreset[] = [
        { id: "workspace", label: "Workspace base", path: workspaceBase },
        { id: "home", label: "Agent-server home", path: homeDir },
        { id: "root", label: "Filesystem root", path: FILESYSTEM_ROOT },
      ];

      return { defaultRoot: workspaceBase, presets };
    },
    staleTime: Infinity,
    gcTime: Infinity,
    meta: { disableToast: true },
  });

  return {
    presets: query.data?.presets ?? [],
    defaultRoot: query.data?.defaultRoot ?? null,
    isLoading: query.isLoading,
    error: (query.error as Error | null) ?? null,
  };
}

export function useStandaloneWorkspaceRuntime(): WorkspaceRuntime & {
  isLoadingRoot: boolean;
  error: Error | null;
} {
  const { backend } = useActiveBackend();
  const storedRoot = useWorkspaceRootStore((state) => state.root);
  const { defaultRoot, isLoading, error } = useWorkspaceRootPresets();
  const root = storedRoot ?? defaultRoot;

  return {
    isStandalone: true,
    conversationId: null,
    workspaceKey: root,
    conversationUrl: null,
    sessionApiKey: backend.apiKey ?? null,
    workingDir: root ?? undefined,
    isReady: !!root,
    isLoadingRoot: isLoading,
    error,
  };
}

export function useSupportsStandaloneFiles(): boolean {
  return useActiveBackend().backend.kind === "local";
}

/** Standalone shell sessions need a reachable local agent-server bash API. */
export function useSupportsStandaloneTerminal(): boolean {
  return useActiveBackend().backend.kind === "local";
}

/** @deprecated Use {@link useSupportsStandaloneFiles} or {@link useSupportsStandaloneTerminal}. */
export function useSupportsStandaloneWorkspace(): boolean {
  return useSupportsStandaloneFiles();
}

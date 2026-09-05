import { useEffect, useRef } from "react";
import { useActiveAcpProfileDetail } from "#/hooks/query/use-active-acp-profile-detail";
import { useCreateConversation } from "#/hooks/mutation/use-create-conversation";
import { useSettings } from "#/hooks/query/use-settings";
import {
  isOpenCodeAcpLaunch,
  OPENCODE_ACP_PREWARM_ENTRY,
  OPENCODE_ACP_PREWARM_MUTATION_KEY,
} from "#/constants/acp-providers";
import type { PluginSpec } from "#/api/conversation-service/agent-server-conversation-service.types";
import type { WorkspaceMode } from "#/api/conversation-metadata-store";

export { OPENCODE_ACP_PREWARM_ENTRY } from "#/constants/acp-providers";

type PrewarmSlot = {
  conversationId: string;
  workingDir?: string;
  workspaceMode?: WorkspaceMode;
};

/**
 * Pre-create an OpenCode ACP conversation so spawn + MCP can run while the
 * user is still typing on the home launcher.
 */
export function useOpencodeAcpPrewarm(options: {
  enabled: boolean;
  workingDir?: string;
  workspaceMode?: WorkspaceMode;
  plugins?: PluginSpec[];
}): {
  take: (input: {
    workingDir?: string;
    workspaceMode?: WorkspaceMode;
  }) => string | null;
} {
  const profile = useActiveAcpProfileDetail();
  const { data: settings } = useSettings();
  const agentSettings = settings?.agent_settings as
    | {
        agent_kind?: string;
        acp_server?: string;
        acp_command?: string | string[];
      }
    | undefined;
  const isOpenCode =
    isOpenCodeAcpLaunch({
      agentKind: profile?.agent_kind,
      acpServer: profile?.acp_server,
      acpCommand: profile?.acp_command,
    }) ||
    isOpenCodeAcpLaunch({
      agentKind: agentSettings?.agent_kind,
      acpServer: agentSettings?.acp_server,
      acpCommand: agentSettings?.acp_command,
    });
  const { mutateAsync: createConversation } = useCreateConversation({
    mutationKey: OPENCODE_ACP_PREWARM_MUTATION_KEY,
  });
  const slotRef = useRef<PrewarmSlot | null>(null);
  const generationRef = useRef(0);

  const workingDir = options.workingDir;
  const workspaceMode = options.workspaceMode;
  const plugins = options.plugins;
  const pluginKey = JSON.stringify(plugins ?? []);

  useEffect(() => {
    if (!options.enabled || !isOpenCode) {
      slotRef.current = null;
      return;
    }
    const generation = ++generationRef.current;
    slotRef.current = null;
    void createConversation({
      entryPoint: OPENCODE_ACP_PREWARM_ENTRY,
      workingDir,
      workspaceMode,
      plugins: plugins?.length ? plugins : undefined,
    })
      .then((data) => {
        if (generation !== generationRef.current) return;
        slotRef.current = {
          conversationId: data.conversation_id,
          workingDir,
          workspaceMode,
        };
      })
      .catch(() => {
        // Fall back to the normal create-on-send path.
      });
  }, [
    options.enabled,
    isOpenCode,
    createConversation,
    workingDir,
    workspaceMode,
    pluginKey,
  ]);

  return {
    take: (input) => {
      const slot = slotRef.current;
      if (!slot) return null;
      if ((input.workingDir ?? "") !== (slot.workingDir ?? "")) return null;
      if ((input.workspaceMode ?? "") !== (slot.workspaceMode ?? "")) {
        return null;
      }
      slotRef.current = null;
      return slot.conversationId;
    },
  };
}

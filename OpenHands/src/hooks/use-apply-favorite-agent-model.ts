import { useCallback } from "react";
import { getStoredConversationMetadata } from "#/api/conversation-metadata-store";
import { useNavigation } from "#/context/navigation-context";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useActivateAgentProfile } from "#/hooks/mutation/use-activate-agent-profile";
import { useCreateConversation } from "#/hooks/mutation/use-create-conversation";
import { useSwitchAcpModel } from "#/hooks/mutation/use-switch-acp-model";
import { useSwitchLlmProfile } from "#/hooks/mutation/use-switch-llm-profile";
import type { ResolvedFavoriteAgentModel } from "#/hooks/use-favorite-agent-models";

/** Applies a shortcut in place, or recreates the conversation for cross-agent picks. */
export function useApplyFavoriteAgentModel() {
  const { conversationId, navigate } = useNavigation();
  const { data: conversation } = useActiveConversation();
  const activateProfile = useActivateAgentProfile();
  const createConversation = useCreateConversation();
  const switchAcpModel = useSwitchAcpModel();
  const switchLlmProfile = useSwitchLlmProfile();

  return useCallback(
    async (
      favorite: ResolvedFavoriteAgentModel,
      currentAgentProfileId: string | null,
    ) => {
      if (!favorite.modelId) return;
      const isConversation = Boolean(conversationId);
      const isCrossAgent = favorite.agentProfileId !== currentAgentProfileId;

      if (!isCrossAgent) {
        if (favorite.agentKind === "acp") {
          await switchAcpModel.mutateAsync({
            conversationId: conversationId ?? null,
            model: favorite.modelId,
          });
        } else {
          await switchLlmProfile.mutateAsync({
            conversationId: conversationId ?? null,
            profileName: favorite.modelId,
          });
        }
        return;
      }

      await activateProfile.mutateAsync(favorite.agentProfileId);
      if (!isConversation) {
        if (favorite.agentKind === "acp") {
          await switchAcpModel.mutateAsync({
            conversationId: null,
            model: favorite.modelId,
          });
        } else {
          await switchLlmProfile.mutateAsync({
            conversationId: null,
            profileName: favorite.modelId,
          });
        }
        return;
      }

      const metadata = conversationId
        ? getStoredConversationMetadata(conversationId)
        : null;
      const created = await createConversation.mutateAsync({
        agentProfileId: favorite.agentProfileId,
        entryPoint: "blank_conversation_favorite_agent_model",
        ...(conversation?.selected_repository
          ? {
              repository: {
                name: conversation.selected_repository,
                gitProvider: conversation.git_provider ?? "github",
                branch: conversation.selected_branch ?? undefined,
              },
            }
          : {}),
        ...(conversation?.selected_workspace
          ? {
              workingDir: conversation.selected_workspace,
              workspaceMode: metadata?.workspace_mode ?? "local_repo",
            }
          : {}),
        ...(metadata?.plugins?.length ? { plugins: metadata.plugins } : {}),
      });
      if (favorite.agentKind === "acp") {
        await switchAcpModel.mutateAsync({
          conversationId: created.conversation_id,
          model: favorite.modelId,
        });
      } else {
        await switchLlmProfile.mutateAsync({
          conversationId: created.conversation_id,
          profileName: favorite.modelId,
        });
      }
      navigate(`/conversations/${created.conversation_id}`);
    },
    [
      activateProfile,
      conversation,
      conversationId,
      createConversation,
      navigate,
      switchAcpModel,
      switchLlmProfile,
    ],
  );
}

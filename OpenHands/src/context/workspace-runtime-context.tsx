import React from "react";

import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useOptionalConversationId } from "#/hooks/use-conversation-id";
import { useRuntimeIsReady } from "#/hooks/use-runtime-is-ready";

export interface WorkspaceRuntime {
  isStandalone: boolean;
  /** Loaded conversation id for conversation-scoped APIs. */
  conversationId: string | null;
  /**
   * Stable key for UI state that must not leak between workspaces — a file
   * opened in one tree usually does not exist in the next. Unlike
   * `conversationId` this comes from the route (or standalone root) so it
   * is available from the first render.
   */
  workspaceKey: string | null;
  conversationUrl: string | null;
  sessionApiKey: string | null;
  workingDir: string | undefined;
  isReady: boolean;
}

const WorkspaceRuntimeContext = React.createContext<WorkspaceRuntime | null>(
  null,
);

export function WorkspaceRuntimeProvider({
  value,
  children,
}: {
  value: WorkspaceRuntime;
  children: React.ReactNode;
}) {
  return (
    <WorkspaceRuntimeContext.Provider value={value}>
      {children}
    </WorkspaceRuntimeContext.Provider>
  );
}

export function useWorkspaceRuntime(): WorkspaceRuntime {
  const override = React.useContext(WorkspaceRuntimeContext);
  const { conversationId: routeConversationId } = useOptionalConversationId();
  const { data: conversation } = useActiveConversation();
  const conversationIsReady = useRuntimeIsReady();

  return React.useMemo(
    () =>
      override ?? {
        isStandalone: false,
        conversationId: conversation?.id ?? null,
        workspaceKey: routeConversationId,
        conversationUrl: conversation?.conversation_url ?? null,
        sessionApiKey: conversation?.session_api_key ?? null,
        workingDir: conversation?.workspace?.working_dir?.trim(),
        isReady: conversationIsReady,
      },
    [override, routeConversationId, conversation, conversationIsReady],
  );
}

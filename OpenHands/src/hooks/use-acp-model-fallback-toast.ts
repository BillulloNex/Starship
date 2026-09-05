import React from "react";
import { AppConversation } from "#/api/conversation-service/agent-server-conversation-service.types";
import { acpModelRefsMatch } from "#/constants/acp-providers";
import { displayErrorToast } from "#/utils/custom-toast-handlers";

/**
 * ACP ``session/set_model`` failures are swallowed by the agent-server
 * ("the session will use the server default"). Surface that on the chip
 * conversation once the runtime model is known.
 */
export function useAcpModelFallbackToast(
  conversation: AppConversation | null | undefined,
) {
  const toastedFor = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!conversation || conversation.agent_kind !== "acp") return;
    const requested = conversation.requested_acp_model;
    const running = conversation.llm_model;
    if (!requested || !running) return;
    if (acpModelRefsMatch(requested, running)) return;

    const key = `${conversation.id}:${requested}:${running}`;
    if (toastedFor.current === key) return;
    toastedFor.current = key;
    displayErrorToast(
      `Could not set model ${requested}; this session is running ${running} instead.`,
    );
  }, [
    conversation?.id,
    conversation?.agent_kind,
    conversation?.requested_acp_model,
    conversation?.llm_model,
  ]);
}

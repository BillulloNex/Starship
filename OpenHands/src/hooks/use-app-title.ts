import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { useUserConversation } from "#/hooks/query/use-user-conversation";
import { useConversationStateStore } from "#/stores/conversation-state-store";
import { ExecutionStatus } from "#/types/agent-server/core/base/common";
import { getAgentStateEmoji } from "#/utils/agent-state-emoji";
import {
  formatRunningTitle,
  prefersReducedMotion,
  RUNNING_TITLE_FRAME_MS,
  RUNNING_TITLE_FRAMES,
} from "#/utils/running-title-frames";

const APP_TITLE = "Starship";

export const useAppTitle = () => {
  const { conversationId } = useParams<{ conversationId: string }>();
  const { data: conversation } = useUserConversation(conversationId ?? null);
  const liveExecutionStatus = useConversationStateStore(
    (state) => state.execution_status,
  );
  const [frame, setFrame] = useState(0);

  const conversationTitle = conversation?.title;
  const baseTitle =
    conversationId && conversationTitle
      ? `${conversationTitle} | ${APP_TITLE}`
      : APP_TITLE;

  const executionStatus = conversationId
    ? (liveExecutionStatus ?? conversation?.execution_status ?? null)
    : null;
  const isRunning = executionStatus === ExecutionStatus.RUNNING;
  const shouldAnimate = isRunning && !prefersReducedMotion();
  const emoji = getAgentStateEmoji(executionStatus);

  useEffect(() => {
    if (!shouldAnimate) {
      setFrame(0);
      return undefined;
    }

    const id = window.setInterval(() => {
      setFrame((current) => (current + 1) % RUNNING_TITLE_FRAMES.length);
    }, RUNNING_TITLE_FRAME_MS);

    return () => window.clearInterval(id);
  }, [shouldAnimate]);

  if (!conversationId) {
    return baseTitle;
  }

  if (shouldAnimate) {
    return formatRunningTitle(baseTitle, frame);
  }

  return emoji ? `${emoji} ${baseTitle}` : baseTitle;
};

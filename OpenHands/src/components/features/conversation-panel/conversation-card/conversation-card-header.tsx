import { ExecutionStatus } from "#/types/agent-server/core/base/common";
import { SandboxStatus } from "#/api/conversation-service/agent-server-conversation-service.types";
import { isArchivedSandboxStatus } from "#/utils/conversation-archive-status";
import { ConversationAutomationBadge } from "../conversation-automation-badge";
import { ConversationCardTitle } from "./conversation-card-title";

interface ConversationCardHeaderProps {
  title: string;
  titleMode: "view" | "edit";
  onTitleSave: (title: string) => void;
  executionStatus?: ExecutionStatus | null;
  sandboxStatus?: SandboxStatus | null;
  automationBadge?: string | null;
}

export function ConversationCardHeader({
  title,
  titleMode,
  onTitleSave,
  sandboxStatus,
  automationBadge,
}: ConversationCardHeaderProps) {
  const isArchived = isArchivedSandboxStatus(sandboxStatus);
  return (
    <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
      <ConversationCardTitle
        title={title}
        titleMode={titleMode}
        onSave={onTitleSave}
        isConversationArchived={isArchived}
      />
      {automationBadge ? (
        <ConversationAutomationBadge label={automationBadge} />
      ) : null}
    </div>
  );
}

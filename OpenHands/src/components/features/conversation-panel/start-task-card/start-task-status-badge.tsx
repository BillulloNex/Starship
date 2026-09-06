import { useTranslation } from "react-i18next";
import type { AppConversationStartTaskStatus } from "#/api/conversation-service/agent-server-conversation-service.types";
import { cn } from "#/utils/utils";
import { getTaskStatusI18nKey } from "#/utils/status";

interface StartTaskStatusBadgeProps {
  taskStatus: AppConversationStartTaskStatus;
}

export function StartTaskStatusBadge({
  taskStatus,
}: StartTaskStatusBadgeProps) {
  const { t } = useTranslation("openhands");

  // Don't show badge for WORKING status (most common, clutters UI)
  if (taskStatus === "WORKING") {
    return null;
  }

  // Localized status label — getTaskStatusI18nKey maps every status (including
  // the terminal READY/ERROR states) to its localized key.
  const getStatusLabel = () => t(getTaskStatusI18nKey(taskStatus));

  // Get status color
  const getStatusStyle = () => {
    switch (taskStatus) {
      case "READY":
        return "bg-[var(--oh-status-success)]/10 text-[var(--oh-status-success)] border-[var(--oh-status-success)]/20";
      case "ERROR":
        return "bg-[var(--oh-status-error)]/10 text-[var(--oh-status-error)] border-[var(--oh-status-error)]/20";
      default:
        return "bg-[var(--oh-color-primary)]/10 text-[var(--oh-color-primary)] border-[var(--oh-color-primary)]/20";
    }
  };

  return (
    <span
      className={cn(
        "text-xs font-medium px-2 py-0.5 rounded border flex-shrink-0",
        getStatusStyle(),
      )}
    >
      {getStatusLabel()}
    </span>
  );
}

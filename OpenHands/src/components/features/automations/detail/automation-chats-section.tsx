import { MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { NavigationLink } from "#/components/shared/navigation-link";
import { useBackendScopedPath } from "#/hooks/use-backend-scoped-path";
import { useAutomationRuns } from "#/hooks/query/use-automation-detail";
import type { Automation } from "#/types/automation";
import { collectAutomationChats } from "#/utils/automation-chats";
import { formatRelativeTime } from "#/utils/format-relative-time";
import { RunStatusBadge } from "./run-status-badge";

interface AutomationChatsSectionProps {
  automation: Automation;
}

export function AutomationChatsSection({
  automation,
}: AutomationChatsSectionProps) {
  const { t, i18n } = useTranslation("openhands");
  const backendScopedPath = useBackendScopedPath();
  const { data, isLoading } = useAutomationRuns({
    id: automation.id,
    limit: 50,
    offset: 0,
  });
  const chats = collectAutomationChats(data?.runs ?? []);

  return (
    <div
      data-testid="automation-chats"
      className="rounded-2xl border border-[var(--oh-border)] bg-[var(--oh-surface)]"
    >
      <div className="flex items-center gap-2 border-b border-[var(--oh-border)] px-5 py-3">
        <span className="size-4 text-muted">
          <MessageSquare className="size-4" aria-hidden strokeWidth={2} />
        </span>
        <h3 className="text-sm font-medium text-content">
          {t(I18nKey.AUTOMATIONS$DETAIL$CHATS)}
        </h3>
      </div>

      {isLoading && (
        <div className="space-y-1 p-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={`skeleton-${i}`}
              className="flex items-center justify-between py-3"
            >
              <div className="h-5 w-64 animate-pulse rounded bg-surface-raised" />
              <div className="h-6 w-24 animate-pulse rounded-full bg-surface-raised" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && chats.length === 0 && (
        <p className="px-5 py-8 text-center text-sm text-muted">
          {t(I18nKey.AUTOMATIONS$DETAIL$NO_CHATS)}
        </p>
      )}

      {!isLoading && chats.length > 0 && (
        <div>
          {chats.map(({ conversationId, run }, index) => {
            const startedAt = run.started_at;
            const timestampLabel = startedAt
              ? formatRelativeTime(startedAt, i18n.language, t)
              : t(I18nKey.AUTOMATIONS$DETAIL$TIME_JUST_NOW);
            return (
              <NavigationLink
                key={conversationId}
                to={backendScopedPath(`/conversations/${conversationId}`)}
                data-testid={`automation-chat-${conversationId}`}
                aria-label={t(I18nKey.AUTOMATIONS$DETAIL$OPEN_CHAT)}
                className={`flex items-center justify-between px-5 py-3 transition-colors hover:bg-surface-raised focus:bg-surface-raised focus:outline-none ${
                  index > 0 ? "border-t border-[var(--oh-border)]" : ""
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-content">
                    {t(I18nKey.AUTOMATIONS$DETAIL$CHAT_AT, {
                      timestamp: timestampLabel,
                    })}
                  </p>
                </div>
                <RunStatusBadge status={run.status} compact />
              </NavigationLink>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { useTranslation } from "react-i18next";
import { ExternalLink, Hand } from "lucide-react";

import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { useBrowserStore } from "#/stores/browser-store";
import { ConversationTabEmptyState } from "#/components/features/conversation/conversation-tab-empty-state";

const iconButtonClassName = cn(
  "inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md",
  "text-[var(--oh-text-tertiary)] hover:bg-tertiary disabled:cursor-not-allowed disabled:opacity-40",
);

const iconClassName = "size-3.5";

export function InteractiveBrowser() {
  const { t } = useTranslation("openhands");
  const { vncUrl, vncReloadCounter } = useBrowserStore();

  if (!vncUrl) {
    return (
      <ConversationTabEmptyState icon={<Hand />}>
        {t(I18nKey.PREVIEW$INTERACTIVE_NO_VNC)}
      </ConversationTabEmptyState>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div
        className="flex min-h-[34px] w-full shrink-0 items-center gap-1 border-b border-[var(--oh-border)] px-2 py-1.5"
        data-testid="interactive-browser-bar"
      >
        <div
          className={cn(
            "flex min-h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md border border-[var(--oh-border)]",
            "bg-amber-500/10 border-amber-500/30 px-2 text-xs leading-5 text-amber-300",
          )}
          data-testid="interactive-browser-banner"
        >
          <Hand className="size-3 shrink-0" />
          <span className="truncate">
            {t(I18nKey.PREVIEW$INTERACTIVE_BANNER)}
          </span>
        </div>

        <a
          href={vncUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t(I18nKey.BUTTON$OPEN_IN_NEW_TAB)}
          title={t(I18nKey.BUTTON$OPEN_IN_NEW_TAB)}
          data-testid="interactive-browser-open-external"
          className={iconButtonClassName}
        >
          <ExternalLink className={iconClassName} aria-hidden strokeWidth={2} />
        </a>
      </div>

      <iframe
        key={`vnc-${vncReloadCounter}`}
        src={vncUrl}
        title={t(I18nKey.PREVIEW$INTERACTIVE_TITLE)}
        data-testid="interactive-browser-iframe"
        className="min-h-0 w-full flex-1 border-0 bg-black"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}

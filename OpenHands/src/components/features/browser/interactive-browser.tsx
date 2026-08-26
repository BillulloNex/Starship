/* eslint-disable i18next/no-literal-string */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink, Hand, RotateCw, Settings2, Check } from "lucide-react";

import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { useBrowserStore } from "#/stores/browser-store";
import {
  buildPreviewUrl,
  usePreviewPorts,
} from "#/hooks/query/use-preview-ports";
import { ConversationTabEmptyState } from "#/components/features/conversation/conversation-tab-empty-state";

const iconButtonClassName = cn(
  "inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md",
  "text-[var(--oh-text-tertiary)] hover:bg-tertiary disabled:cursor-not-allowed disabled:opacity-40",
);

const iconClassName = "size-3.5";

export function InteractiveBrowser() {
  const { t } = useTranslation("openhands");
  const { vncUrl, setVncUrl, vncReloadCounter, reloadVnc } = useBrowserStore();
  const { data: previewData } = usePreviewPorts();

  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [customInput, setCustomInput] = useState("");

  const envBrowserUrl =
    (import.meta.env.VITE_BROWSER_VM_URL as string | undefined) ||
    (import.meta.env.VITE_REMOTE_BROWSER_URL as string | undefined) ||
    "";

  const effectiveUrl =
    vncUrl ||
    envBrowserUrl ||
    (previewData?.urlTemplate
      ? buildPreviewUrl(previewData.urlTemplate, 6080)
      : "") ||
    "";

  const handleSaveCustomUrl = () => {
    if (customInput.trim()) {
      setVncUrl(customInput.trim());
    }
    setIsEditingUrl(false);
  };

  if (!effectiveUrl && !isEditingUrl) {
    return (
      <ConversationTabEmptyState icon={<Hand />}>
        <div className="flex flex-col items-center gap-3 text-center max-w-sm px-4">
          <span className="font-semibold text-sm text-[var(--oh-text-secondary)]">
            Collaborative Browser VM (browser-v2)
          </span>
          <p className="text-xs text-[var(--oh-muted)]">
            {t(I18nKey.PREVIEW$INTERACTIVE_NO_VNC)}
          </p>
          <button
            type="button"
            onClick={() => {
              setCustomInput(effectiveUrl);
              setIsEditingUrl(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-[var(--oh-surface-raised)] border border-[var(--oh-border)] text-[var(--oh-text-secondary)] hover:bg-[var(--oh-interactive-hover)] transition-colors"
          >
            <Settings2 className="size-3.5" />
            Connect Browser VM URL
          </button>
        </div>
      </ConversationTabEmptyState>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div
        className="flex min-h-[34px] w-full shrink-0 items-center gap-1.5 border-b border-[var(--oh-border)] px-2 py-1.5"
        data-testid="interactive-browser-bar"
      >
        {isEditingUrl ? (
          <div className="flex flex-1 items-center gap-1">
            <input
              type="text"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              placeholder="e.g. http://<VM_IP>:6080/vnc.html or https://browser.beenex.org"
              className="flex-1 h-7 rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface-raised)] px-2 text-xs text-[var(--oh-text-primary)] focus:outline-none focus:ring-1 focus:ring-amber-500"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveCustomUrl();
                if (e.key === "Escape") setIsEditingUrl(false);
              }}
            />
            <button
              type="button"
              onClick={handleSaveCustomUrl}
              className="h-7 px-2 rounded-md bg-amber-500 text-black text-xs font-medium hover:bg-amber-400"
            >
              <Check className="size-3.5" />
            </button>
          </div>
        ) : (
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
        )}

        <button
          type="button"
          onClick={() => {
            setCustomInput(effectiveUrl);
            setIsEditingUrl(!isEditingUrl);
          }}
          aria-label="Configure Browser VM URL"
          title="Configure Browser VM URL"
          className={iconButtonClassName}
        >
          <Settings2 className={iconClassName} aria-hidden strokeWidth={2} />
        </button>

        <button
          type="button"
          onClick={reloadVnc}
          aria-label={t(I18nKey.PREVIEW$RELOAD)}
          title={t(I18nKey.PREVIEW$RELOAD)}
          className={iconButtonClassName}
        >
          <RotateCw className={iconClassName} aria-hidden strokeWidth={2} />
        </button>

        {effectiveUrl && (
          <a
            href={effectiveUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t(I18nKey.BUTTON$OPEN_IN_NEW_TAB)}
            title={t(I18nKey.BUTTON$OPEN_IN_NEW_TAB)}
            data-testid="interactive-browser-open-external"
            className={iconButtonClassName}
          >
            <ExternalLink
              className={iconClassName}
              aria-hidden
              strokeWidth={2}
            />
          </a>
        )}
      </div>

      {effectiveUrl ? (
        <iframe
          key={`vnc-${vncReloadCounter}-${effectiveUrl}`}
          src={effectiveUrl}
          title={t(I18nKey.PREVIEW$INTERACTIVE_TITLE)}
          data-testid="interactive-browser-iframe"
          className="min-h-0 w-full flex-1 border-0 bg-black"
          allow="clipboard-read; clipboard-write"
        />
      ) : null}
    </div>
  );
}

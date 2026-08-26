import { useState } from "react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import {
  ExternalLink,
  Hand,
  RotateCw,
  Settings2,
  Check,
  Globe,
  TerminalSquare,
} from "lucide-react";

import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { useBrowserStore } from "#/stores/browser-store";
import { ConversationTabEmptyState } from "#/components/features/conversation/conversation-tab-empty-state";

const iconButtonClassName = cn(
  "inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md",
  "text-[var(--oh-text-tertiary)] hover:bg-tertiary disabled:cursor-not-allowed disabled:opacity-40",
);

const iconClassName = "size-3.5";

const STEEL_DEFAULT_URL =
  "https://surf.beenex.org/v1/sessions/debug?interactive=true&showControls=true&theme=dark";
const STEEL_DEVTOOLS_URL = "https://surf.beenex.org/v1/devtools/inspector.html";

export function InteractiveBrowser() {
  const { t } = useTranslation("openhands");
  const { conversationId, automationId } = useParams<{
    conversationId?: string;
    automationId?: string;
  }>();
  const activeSessionId = conversationId || automationId || "default";

  const { vncUrl, setVncUrl, vncReloadCounter, reloadVnc } = useBrowserStore();


  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [customInput, setCustomInput] = useState("");

  // Priority: 1) user-set URL in store, 2) build-time env var, 3) Steel default
  const envBrowserUrl =
    (import.meta.env.VITE_BROWSER_VM_URL as string | undefined) ||
    (import.meta.env.VITE_REMOTE_BROWSER_URL as string | undefined) ||
    STEEL_DEFAULT_URL;

  const effectiveUrl = vncUrl || envBrowserUrl;

  const isDevTools = effectiveUrl.includes("devtools/inspector.html");

  const handleSaveCustomUrl = () => {
    if (customInput.trim()) {
      setVncUrl(customInput.trim());
    }
    setIsEditingUrl(false);
  };

  const handleSelectPreset = (url: string) => {
    setVncUrl(url);
    setIsEditingUrl(false);
  };

  if (!effectiveUrl && !isEditingUrl) {
    return (
      <ConversationTabEmptyState icon={<Hand />}>
        <div className="flex flex-col items-center gap-3 text-center max-w-sm px-4">
          <span className="font-semibold text-sm text-[var(--oh-text-secondary)]">
            Collaborative Steel Browser (surf.beenex.org)
          </span>
          <p className="text-xs text-[var(--oh-muted)]">
            {t(I18nKey.PREVIEW$INTERACTIVE_NO_VNC)}
          </p>
          <button
            type="button"
            onClick={() => {
              setCustomInput(effectiveUrl || STEEL_DEFAULT_URL);
              setIsEditingUrl(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-[var(--oh-surface-raised)] border border-[var(--oh-border)] text-[var(--oh-text-secondary)] hover:bg-[var(--oh-interactive-hover)] transition-colors"
          >
            <Settings2 className="size-3.5" />
            Configure Steel Browser URL
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
              placeholder="e.g. https://surf.beenex.org/v1/sessions/debug or custom URL"
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
              "flex min-h-7 min-w-0 flex-1 items-center justify-between gap-1.5 rounded-md border border-[var(--oh-border)]",
              "bg-amber-500/10 border-amber-500/30 px-2 text-xs leading-5 text-amber-300",
            )}
            data-testid="interactive-browser-banner"
          >
            <div className="flex items-center gap-1.5 truncate">
              <Hand className="size-3 shrink-0" />
              <span className="truncate">
                {t(I18nKey.PREVIEW$INTERACTIVE_BANNER)}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => handleSelectPreset(STEEL_DEFAULT_URL)}
                title="Switch to Live Steel Viewer"
                className={cn(
                  "px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer",
                  !isDevTools
                    ? "bg-amber-500/20 text-amber-200 border border-amber-500/40"
                    : "text-amber-300/60 hover:text-amber-200",
                )}
              >
                <Globe className="size-2.5 inline mr-1" />
                Live
              </button>
              <button
                type="button"
                onClick={() => handleSelectPreset(STEEL_DEVTOOLS_URL)}
                title="Switch to DevTools Inspector"
                className={cn(
                  "px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer",
                  isDevTools
                    ? "bg-amber-500/20 text-amber-200 border border-amber-500/40"
                    : "text-amber-300/60 hover:text-amber-200",
                )}
              >
                <TerminalSquare className="size-2.5 inline mr-1" />
                DevTools
              </button>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            setCustomInput(effectiveUrl);
            setIsEditingUrl(!isEditingUrl);
          }}
          aria-label="Configure Browser URL"
          title="Configure Browser URL"
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
          key={`steel-${activeSessionId}-${vncReloadCounter}-${effectiveUrl}`}
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


import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, ExternalLink, Globe, RotateCw } from "lucide-react";

import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { useBrowserStore } from "#/stores/browser-store";
import {
  buildPreviewUrl,
  usePreviewPorts,
} from "#/hooks/query/use-preview-ports";
import { useApps, type AppRecord } from "#/hooks/query/use-apps";
import { ConversationTabEmptyState } from "#/components/features/conversation/conversation-tab-empty-state";

const iconButtonClassName = cn(
  "inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md",
  "text-[var(--oh-text-tertiary)] hover:bg-tertiary disabled:cursor-not-allowed disabled:opacity-40",
);

const iconClassName = "size-3.5";

/**
 * Interactive preview of an app running inside the workspace container.
 *
 * The agent's browser tool only ever produces a screenshot, so the classic
 * Browser pane cannot be clicked. This pane instead embeds the real app,
 * served through the ingress's host-based preview route, which means the user
 * (and anyone they send the link to) gets the actual running app.
 */
export function LivePreview() {
  const { t } = useTranslation("openhands");
  const { previewPort, previewReloadCounter, setPreviewPort, reloadPreview } =
    useBrowserStore();
  const { data, isLoading } = usePreviewPorts();
  const { data: appsData } = useApps();
  const [didCopy, setDidCopy] = useState(false);

  const registeredAppByPort = useMemo(() => {
    const map = new Map<number, AppRecord>();
    for (const app of appsData?.apps || []) {
      if (app.port) {
        map.set(app.port, app);
      }
    }
    return map;
  }, [appsData?.apps]);

  // Every listening port is previewable — the proxy matches preview hostnames
  // by pattern, so there is no per-port registration to fall out of sync with.
  const previewable = useMemo(() => data?.listening ?? [], [data?.listening]);

  // Follow the running app automatically until the user picks a port, and let
  // go of a selection once that server stops, so the pane doesn't sit on a
  // dead port after the agent restarts something elsewhere.
  useEffect(() => {
    if (previewPort !== null && !previewable.includes(previewPort)) {
      setPreviewPort(null);
    }
  }, [previewPort, previewable, setPreviewPort]);

  const activePort = previewPort ?? previewable[0] ?? null;
  const activeApp = activePort ? registeredAppByPort.get(activePort) : null;
  const previewUrl = activePort
    ? (activeApp?.url_space || buildPreviewUrl(data?.urlTemplate ?? null, activePort))
    : null;

  useEffect(() => {
    if (!didCopy) return undefined;
    const timer = setTimeout(() => setDidCopy(false), 2000);
    return () => clearTimeout(timer);
  }, [didCopy]);

  const handleCopy = async () => {
    if (!previewUrl) return;
    try {
      await navigator.clipboard.writeText(previewUrl);
      setDidCopy(true);
    } catch {
      // Clipboard blocked (insecure context / denied permission) — the URL is
      // visible in the bar, so the user can still select it by hand.
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-[var(--oh-muted)]">
        {t(I18nKey.PREVIEW$LOADING)}
      </div>
    );
  }

  if (!data?.enabled) {
    return (
      <ConversationTabEmptyState icon={<Globe />}>
        {t(I18nKey.PREVIEW$DISABLED)}
      </ConversationTabEmptyState>
    );
  }

  if (previewable.length === 0) {
    return (
      <ConversationTabEmptyState icon={<Globe />}>
        {t(I18nKey.PREVIEW$NO_SERVER)}
      </ConversationTabEmptyState>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div
        className="flex min-h-[34px] w-full shrink-0 items-center gap-1 border-b border-[var(--oh-border)] px-2 py-1.5"
        data-testid="live-preview-bar"
      >
        {previewable.length > 1 ? (
          <select
            value={activePort ?? ""}
            onChange={(event) => setPreviewPort(Number(event.target.value))}
            aria-label={t(I18nKey.PREVIEW$SELECT_PORT)}
            data-testid="live-preview-port-select"
            className={cn(
              "h-7 shrink-0 cursor-pointer rounded-md border border-[var(--oh-border)]",
              "bg-[var(--oh-surface-raised)] px-1.5 text-xs text-[var(--oh-text-tertiary)]",
            )}
          >
            {previewable.map((port) => {
              const app = registeredAppByPort.get(port);
              return (
                <option key={port} value={port}>
                  {app ? `${app.title || app.name} (:${port})` : `:${port}`}
                </option>
              );
            })}
          </select>
        ) : null}

        <div
          className={cn(
            "flex min-h-7 min-w-0 flex-1 items-center rounded-md border border-[var(--oh-border)]",
            "bg-[var(--oh-surface-raised)] px-2 text-xs leading-5 text-[var(--oh-text-tertiary)]",
          )}
          data-testid="live-preview-url"
          title={previewUrl ?? undefined}
        >
          <span className="truncate">{previewUrl}</span>
        </div>

        <button
          type="button"
          onClick={reloadPreview}
          aria-label={t(I18nKey.PREVIEW$RELOAD)}
          title={t(I18nKey.PREVIEW$RELOAD)}
          data-testid="live-preview-reload"
          className={iconButtonClassName}
        >
          <RotateCw className={iconClassName} aria-hidden strokeWidth={2} />
        </button>

        <button
          type="button"
          onClick={handleCopy}
          aria-label={t(I18nKey.PREVIEW$COPY_LINK)}
          title={t(I18nKey.PREVIEW$COPY_LINK)}
          data-testid="live-preview-copy"
          className={iconButtonClassName}
        >
          {didCopy ? (
            <Check className={iconClassName} aria-hidden strokeWidth={2} />
          ) : (
            <Copy className={iconClassName} aria-hidden strokeWidth={2} />
          )}
        </button>

        <a
          href={previewUrl ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t(I18nKey.BUTTON$OPEN_IN_NEW_TAB)}
          title={t(I18nKey.BUTTON$OPEN_IN_NEW_TAB)}
          data-testid="live-preview-open-external"
          className={iconButtonClassName}
        >
          <ExternalLink className={iconClassName} aria-hidden strokeWidth={2} />
        </a>
      </div>

      {previewUrl ? (
        <iframe
          // Remounting on port/counter change is what makes the reload button
          // work: the preview is a different origin, so we cannot reach into
          // its contentWindow to call location.reload().
          key={`${previewUrl}-${previewReloadCounter}`}
          src={previewUrl}
          title={t(I18nKey.PREVIEW$IFRAME_TITLE)}
          data-testid="live-preview-iframe"
          className="min-h-0 w-full flex-1 border-0 bg-white"
        />
      ) : null}
    </div>
  );
}

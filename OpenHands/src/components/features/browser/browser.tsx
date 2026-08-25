import { useTranslation } from "react-i18next";
import { Camera, MousePointerClick, Hand } from "lucide-react";

import { I18nKey } from "#/i18n/declaration";
import { SegmentedToggle } from "#/components/features/files-tab/segmented-toggle";
import {
  resolveBrowserViewMode,
  useBrowserStore,
  type BrowserViewMode,
} from "#/stores/browser-store";
import { BrowserSnapshot } from "./browser-snapshot";
import { BrowserChromeBar } from "./browser-chrome-bar";
import { EmptyBrowserMessage } from "./empty-browser-message";
import { LivePreview } from "./live-preview";
import { InteractiveBrowser } from "./interactive-browser";

export function BrowserPanel() {
  const { t } = useTranslation("openhands");
  const { url, screenshotSrc, viewMode, setViewMode } = useBrowserStore();
  const hasPage = Boolean(screenshotSrc);
  const resolvedMode = resolveBrowserViewMode(viewMode, screenshotSrc);

  const imgSrc = screenshotSrc?.startsWith("data:image/png;base64,")
    ? screenshotSrc
    : `data:image/png;base64,${screenshotSrc ?? ""}`;

  return (
    <div className="flex h-full min-h-0 w-full flex-col text-[var(--oh-muted)]">
      <div className="flex w-full shrink-0 items-center justify-end border-b border-[var(--oh-border)] px-2 py-1.5">
        <SegmentedToggle<BrowserViewMode>
          value={resolvedMode}
          onChange={setViewMode}
          ariaLabel={t(I18nKey.PREVIEW$VIEW_MODE)}
          testId="browser-view-mode-toggle"
          options={[
            {
              value: "interactive",
              label: t(I18nKey.PREVIEW$INTERACTIVE),
              icon: <Hand />,
            },
            {
              value: "live",
              label: t(I18nKey.PREVIEW$LIVE),
              icon: <MousePointerClick />,
            },
            {
              value: "snapshot",
              label: t(I18nKey.PREVIEW$SNAPSHOT),
              icon: <Camera />,
            },
          ]}
        />
      </div>

      {resolvedMode === "interactive" ? (
        <InteractiveBrowser />
      ) : resolvedMode === "live" ? (
        <LivePreview />
      ) : (
        <>
          <BrowserChromeBar url={url} hasPage={hasPage} />
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-hide bg-[var(--oh-surface)]">
            {screenshotSrc ? (
              <BrowserSnapshot src={imgSrc} />
            ) : (
              <EmptyBrowserMessage />
            )}
          </div>
        </>
      )}
    </div>
  );
}

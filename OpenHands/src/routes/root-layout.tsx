import React from "react";
import {
  useRouteError,
  isRouteErrorResponse,
  Outlet,
  useLocation,
} from "react-router";

import { useAutoDecrement } from "#/hooks/use-auto-decrement";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import i18n from "#/i18n";
import { useConfig } from "#/hooks/query/use-config";
import { Sidebar } from "#/components/features/sidebar/sidebar";
import { SidebarMobileNavProvider } from "#/components/features/sidebar/sidebar-mobile-nav-context";
import { SidebarMobileMenuBar } from "#/components/features/sidebar/sidebar-mobile-menu-bar";
import { useSettings } from "#/hooks/query/use-settings";
import { useEnsureActiveProfile } from "#/hooks/use-ensure-active-profile";
import { useSyncTelemetryConsent } from "#/hooks/use-sync-telemetry-consent";
import { useSyncAutomationTelemetryConsent } from "#/hooks/use-sync-automation-telemetry-consent";

import { useTelemetryIdentity } from "#/hooks/use-telemetry-identity";
import { LoadingSpinner } from "#/components/shared/loading-spinner";
import { useAppTitle } from "#/hooks/use-app-title";
import { ReactRouterNavigationProvider } from "./react-router-navigation-provider";
import { OnboardingHost } from "#/components/features/onboarding";
import { isOnboardingPreviewActive } from "#/components/features/onboarding/onboarding-preview";

const EnvironmentSwitchOverlay = React.lazy(
  () => import("#/components/features/backends/environment-switch-overlay"),
);
const AlertBanner = React.lazy(() =>
  import("#/components/features/alerts/alert-banner").then((m) => ({
    default: m.AlertBanner,
  })),
);

import { useIdeViewStore } from "#/stores/ide-view-store";
import {
  useBreakpoint,
  SIDEBAR_RAIL_COLLAPSE_MAX_WIDTH,
} from "#/hooks/use-breakpoint";
import { cn } from "#/utils/utils";

import {
  isChunkLoadError,
  reloadOnChunkError,
} from "#/utils/handle-chunk-load-error";

export function ErrorBoundary() {
  const error = useRouteError();
  const { t } = useTranslation("openhands");

  React.useEffect(() => {
    if (isChunkLoadError(error)) {
      reloadOnChunkError();
    }
  }, [error]);

  if (isRouteErrorResponse(error)) {
    return (
      <div>
        <h1>{error.status}</h1>
        <p>{error.statusText}</p>
        <pre>
          {error.data instanceof Object
            ? JSON.stringify(error.data)
            : error.data}
        </pre>
      </div>
    );
  }
  if (error instanceof Error) {
    return (
      <div>
        <h1>{t(I18nKey.ERROR$GENERIC)}</h1>
        <pre>{error.message}</pre>
      </div>
    );
  }

  return (
    <div>
      <h1>{t(I18nKey.ERROR$UNKNOWN)}</h1>
    </div>
  );
}

function AppDocumentTitle() {
  const appTitle = useAppTitle();
  return <title>{appTitle}</title>;
}

export default function MainApp() {
  const location = useLocation();
  const { data: settings } = useSettings();
  const config = useConfig();

  useSyncAutomationTelemetryConsent();

  useSyncTelemetryConsent();
  useTelemetryIdentity();
  useAutoDecrement();
  // Local-mode policy: keep a profile active so a usable LLM is always selected.
  useEnsureActiveProfile();

  React.useEffect(() => {
    if (settings?.language) {
      i18n.changeLanguage(settings.language);
    }
  }, [settings?.language]);

  if (config.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  // Conversation + full-screen panel routes put the mobile menu control in the
  // chat / panel header; omit the extra top row so we don't duplicate chrome.
  const isConversationRoute = /^\/conversations\/[^/]+/.test(location.pathname);
  const hideMobileSidebarMenuBar = isConversationRoute;
  const showOnboardingPreview = isOnboardingPreviewActive(location.search);

  const isMobile = useBreakpoint(SIDEBAR_RAIL_COLLAPSE_MAX_WIDTH);
  const viewMode = useIdeViewStore((s) => s.viewMode);
  // Hide the outer agent sidebar in IDE mode during a conversation on desktop,
  // making IDE mode a completely separate full-screen workspace.
  const isIdeMode = viewMode === "ide" && isConversationRoute && !isMobile;

  return (
    <ReactRouterNavigationProvider>
      <SidebarMobileNavProvider>
        <div
          data-testid="root-layout"
          className={cn(
            "h-screen flex flex-col md:flex-row bg-base overflow-hidden p-0",
            !isIdeMode && "lg:min-w-5xl",
          )}
        >
          <AppDocumentTitle />
          {!isIdeMode ? <Sidebar /> : null}

          <div
            className={cn(
              "flex min-h-0 flex-col w-full min-w-0 h-full",
              !isIdeMode && "gap-3",
            )}
          >
            {!hideMobileSidebarMenuBar && !isIdeMode ? (
              <SidebarMobileMenuBar />
            ) : null}
            {config.data &&
              (config.data.maintenance_start_time ||
                (config.data.faulty_models &&
                  config.data.faulty_models.length > 0) ||
                config.data.error_message) && (
                <React.Suspense fallback={null}>
                  <AlertBanner
                    maintenanceStartTime={config.data.maintenance_start_time}
                    faultyModels={config.data.faulty_models}
                    errorMessage={config.data.error_message}
                    updatedAt={config.data.updated_at}
                  />
                </React.Suspense>
              )}
            <div
              id="root-outlet"
              className={cn(
                "relative flex-1 px-0",
                isIdeMode
                  ? "overflow-hidden"
                  : "overflow-auto custom-scrollbar",
              )}
            >
              <Outlet />
            </div>
          </div>
        </div>
        <React.Suspense fallback={null}>
          <EnvironmentSwitchOverlay />
        </React.Suspense>
        {showOnboardingPreview ? <OnboardingHost /> : null}
      </SidebarMobileNavProvider>
    </ReactRouterNavigationProvider>
  );
}

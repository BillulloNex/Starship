import {
  Links,
  LinksFunction,
  Meta,
  MetaFunction,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
  useNavigate,
  useNavigation as useRouterNavigation,
  useRouteError,
  isRouteErrorResponse,
} from "react-router";
import "./tailwind.css";
import "./index.css";
import React from "react";
import {
  isChunkLoadError,
  reloadOnChunkError,
} from "#/utils/handle-chunk-load-error";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast, { ToastBar, Toaster } from "react-hot-toast";
import { X } from "lucide-react";
import {
  clearCachedAgentServerInfo,
  isAgentServerUnavailableError,
  isAgentServerAuthError,
} from "#/api/agent-server-compatibility";
import {
  getLockedCloudAuthMode,
  getLockedCloudHost,
  isAuthRequiredAndMissing,
  isSameCloudHost,
} from "#/api/agent-server-config";
import {
  authenticateWithMainAppCookie,
  redirectToMainAppLogin,
  shouldUseMainAppCookieAuth,
} from "#/api/main-app-auth";
import { getEffectiveLocalBackend } from "#/api/backend-registry/active-store";
import { useActiveBackendContext } from "#/contexts/active-backend-context";
import {
  isCloudBackendApiKeyOrNetworkHealthError,
  isCloudBackendLoggedOutHealthError,
  useBackendsHealth,
} from "#/hooks/query/use-backends-health";
import { TOAST_OPTIONS } from "#/utils/custom-toast-handlers";
import { LoadingSpinner } from "#/components/shared/loading-spinner";
import { useConfig } from "#/hooks/query/use-config";
import { QUERY_KEYS } from "#/hooks/query/query-keys";
import { AgentServerUIRoot } from "#/components/providers";
import { TelemetryConsentBanner } from "#/components/features/analytics/telemetry-consent-banner";
import { buildAgentCanvasPath } from "#/utils/base-path";
import { useOnboardingCompletion } from "#/components/features/onboarding/use-onboarding-completion";
import { NavigationProvider } from "#/context/navigation-context";
import {
  applyColorTheme,
  readPersistedColorTheme,
} from "#/themes/color-themes";

/** Applies the persisted color-theme palette to document.body on mount. */
function ColorThemeApplier() {
  React.useEffect(() => {
    applyColorTheme(readPersistedColorTheme());
  }, []);
  return null;
}

// Only rendered when the active backend is unreachable; keep the modal out of
// the default root graph.
const ManageBackendsModal = React.lazy(() =>
  import("#/components/features/backends/manage-backends-modal").then((m) => ({
    default: m.ManageBackendsModal,
  })),
);

// Rendered when the backend returns 401 (public mode — user must paste key).
const ApiKeyEntryScreen = React.lazy(
  () => import("#/components/features/backends/api-key-entry-screen"),
);

// Rendered only for first-run public/frontend-only bootstraps; keep the
// onboarding flow out of the root bundle until this rare gate is active.
const OnboardingModal = React.lazy(() =>
  import("#/components/features/onboarding/onboarding-modal").then((m) => ({
    default: m.OnboardingModal,
  })),
);

// Rendered for first-run in locked-to-Cloud mode; shows Cloud login directly
// without the onboarding progress bars.
const BackendFormModal = React.lazy(() =>
  import("#/components/features/backends/backend-form-modal").then((m) => ({
    default: m.BackendFormModal,
  })),
);

const PRE_HYDRATION_ERROR_HANDLER = `(function(){
  var K='grokbot_prehydrate_reload',T=10000;
  function isChunkErr(t,e){
    if(t&&(t.tagName==='SCRIPT'||t.tagName==='LINK')){
      var s=t.src||t.href||'';
      if(s.indexOf('/assets/')!==-1||s.endsWith('.js')||s.endsWith('.css'))return true;
    }
    var m=(e&&(e.message||e.name||String(e)))||'';
    var l=m.toLowerCase();
    return l.indexOf('failed to fetch dynamically imported module')!==-1||
      l.indexOf('error loading dynamically imported module')!==-1||
      l.indexOf('importing a module script failed')!==-1||
      l.indexOf('loading chunk')!==-1||
      l.indexOf('chunkloaderror')!==-1;
  }
  function recover(){
    try{
      var last=Number(sessionStorage.getItem(K)||0);
      var now=Date.now();
      if(!last||now-last>T){
        sessionStorage.setItem(K,String(now));
        var q=window.location.search||'';
        var c=q.replace(/[?&]_rb=\\d+/,'');
        var s=c?(c.indexOf('?')!==-1?'&':'?'):'?';
        window.location.href=window.location.pathname+c+s+'_rb='+now+window.location.hash;
        return;
      }
    }catch(e){}
    function showFallback(){
      if(document.getElementById('grokbot-recovery-banner'))return;
      var d=document.createElement('div');
      d.id='grokbot-recovery-banner';
      d.style.cssText='position:fixed;inset:0;background:#090d16;color:#f0f6fc;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,sans-serif;z-index:999999;padding:24px;text-align:center;';
      d.innerHTML='<div style="max-width:420px;padding:32px;background:#151b23;border:1px solid rgba(255,255,255,0.12);border-radius:16px;box-shadow:0 24px 48px rgba(0,0,0,0.6);"><h2 style="font-size:20px;font-weight:700;margin:0 0 12px 0;color:#fff;">Update Available</h2><p style="font-size:14px;color:#8b949e;line-height:1.5;margin:0 0 24px 0;">A new version of GrokBot was deployed. Refresh to update.</p><button onclick="try{sessionStorage.removeItem(\\x27'+K+'\\x27);}catch(e){}window.location.reload();" style="background:#238636;color:#fff;font-weight:600;font-size:14px;padding:10px 24px;border-radius:8px;border:none;cursor:pointer;">Reload Page</button></div>';
      if(document.body){document.body.appendChild(d);}
      else{document.addEventListener('DOMContentLoaded',function(){if(document.body)document.body.appendChild(d);});}
    }
    if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',showFallback);}
    else{showFallback();}
  }
  window.addEventListener('error',function(e){if(isChunkErr(e.target,e.error||e.message)){recover();}},true);
  window.addEventListener('unhandledrejection',function(e){if(isChunkErr(null,e.reason)){recover();}});
})();`;

export function AppToaster() {
  return (
    <Toaster toastOptions={TOAST_OPTIONS}>
      {(t) => (
        <ToastBar toast={t}>
          {({ icon, message }) => (
            <>
              {icon}
              {message}
              {t.type !== "loading" && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toast.dismiss(t.id);
                  }}
                  className="ml-auto shrink-0 self-start rounded p-1 text-[var(--oh-muted,#9ca3af)] hover:bg-white/10 hover:text-white transition-colors cursor-pointer -mr-1 mt-0.5"
                  /* eslint-disable-next-line i18next/no-literal-string */
                  aria-label="Close notification"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
            </>
          )}
        </ToastBar>
      )}
    </Toaster>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        <script
          dangerouslySetInnerHTML={{ __html: PRE_HYDRATION_ERROR_HANDLER }}
        />
      </head>
      <body data-agent-server-ui="" className="m-0">
        <AgentServerUIRoot contentClassName="min-h-screen">
          <ColorThemeApplier />
          {children}
          <AppToaster />
          <div id="modal-portal-exit" />
        </AgentServerUIRoot>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export function HydrateFallback() {
  return <AgentServerBootstrapLoading />;
}

function AgentServerBootstrapLoading() {
  return (
    <main className="min-h-screen bg-base px-6 py-10 text-white">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center">
        <div className="rounded-3xl border border-white/10 bg-base/80 px-8 py-10 shadow-2xl">
          <LoadingSpinner size="large" />
        </div>
      </div>
    </main>
  );
}

/**
 * When the active backend is unreachable, the rest of the app cannot
 * render (most queries chain off of `/server_info`). Drop a minimal
 * placeholder behind the Manage Backends modal so the user can edit,
 * add, or pick another backend right away.
 */
function MissingAgentServerScreen() {
  const queryClient = useQueryClient();

  // The modal is the no-backend gate. Selecting or adding a reachable
  // backend must re-run the /server_info probe; otherwise the app stays
  // behind the recovery screen because the failed bootstrap query will not
  // re-fire on its own. Re-fetch only when a backend now exists.
  const handleClose = React.useCallback(() => {
    if (getEffectiveLocalBackend()) {
      clearCachedAgentServerInfo();
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.WEB_CLIENT_CONFIG,
      });
    }
  }, [queryClient]);

  return (
    <main
      data-testid="agent-server-onboarding-screen"
      className="min-h-screen bg-base"
    >
      <React.Suspense fallback={null}>
        <ManageBackendsModal onClose={handleClose} recoveryMode />
      </React.Suspense>
    </main>
  );
}
function FirstRunOnboardingScreen({ onClose }: { onClose: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const routerNavigation = useRouterNavigation();
  const conversationId =
    location.pathname.match(/^\/conversations\/([^/]+)/)?.[1] ?? null;
  const navigationValue = React.useMemo(
    () => ({
      currentPath: location.pathname,
      conversationId,
      isNavigating: Boolean(routerNavigation.location),
      navigate: (to: string, options?: { replace?: boolean }) =>
        navigate(to, options),
    }),
    [conversationId, location.pathname, navigate, routerNavigation.location],
  );

  const lockedCloudHost = getLockedCloudHost();
  const isLockedToCloud = lockedCloudHost !== null;

  // In locked-to-Cloud mode, show the Add Backend modal directly with Cloud
  // login, instead of the full onboarding flow with progress bars. This
  // matches the UX expectation for canvas.openhands.dev where Cloud is the
  // only backend option.
  if (isLockedToCloud) {
    return (
      <main
        data-testid="first-run-onboarding-screen"
        className="min-h-screen bg-base"
      >
        <React.Suspense fallback={<AgentServerBootstrapLoading />}>
          <BackendFormModal
            mode="add"
            onClose={onClose}
            source="manage_backends_modal"
            hideCloseButton
          />
        </React.Suspense>
      </main>
    );
  }

  return (
    <main
      data-testid="first-run-onboarding-screen"
      className="min-h-screen bg-base"
    >
      <NavigationProvider value={navigationValue}>
        <React.Suspense fallback={<AgentServerBootstrapLoading />}>
          <OnboardingModal onClose={onClose} />
        </React.Suspense>
      </NavigationProvider>
    </main>
  );
}

export const links: LinksFunction = () => [
  {
    rel: "icon",
    type: "image/svg+xml",
    href: buildAgentCanvasPath("/favicon.svg"),
  },
];

export const meta: MetaFunction = () => [
  { title: "OpenHands" },
  { name: "description", content: "Let's Start Building!" },
];

export default function App() {
  // Flag-based gate: in public mode (VITE_AUTH_REQUIRED=true) with no
  // session key yet, show the auth screen immediately — no network
  // round-trip needed.
  //
  // `isAuthRequiredAndMissing()` only checks for a *baked-in* session
  // key (env var / window global). In public mode the baked key is
  // intentionally absent — the user enters it through the auth screen,
  // which persists it to the backend registry (localStorage). After a
  // reload the baked key is still null, but the registry has the key.
  // So: skip the instant gate when a registered backend already carries
  // an API key — let the normal /server_info probe validate it instead.
  const bakedKeyMissing = isAuthRequiredAndMissing();
  const hasRegisteredKey = Boolean(getEffectiveLocalBackend()?.apiKey);
  const authMissing = bakedKeyMissing && !hasRegisteredKey;
  const { active } = useActiveBackendContext();
  // In locked-to-Cloud mode the only valid backend is a Cloud backend whose
  // host matches the configured locked Cloud host. A missing backend, a stale
  // Local backend (e.g. one persisted from a previous non-locked session), or
  // a Cloud backend pointing at a *different* host must all trigger first-run
  // onboarding instead of the Manage Backends recovery modal — the onboarding
  // flow owns the Cloud login that replaces the stale backend.
  const lockedCloudHost = getLockedCloudHost();
  const lockedCloudAuthMode = getLockedCloudAuthMode();
  const isLockedToCloud = lockedCloudHost !== null;
  // True only when the active backend IS the configured locked Cloud host
  // (normalized comparison so trailing slash / case / protocol differences
  // don't cause false negatives). This is the single signal the locked-mode
  // gates key off of: a reachable stale Local backend or a Cloud backend on
  // another host must never be treated as the locked backend.
  const isActiveLockedCloudBackend =
    isLockedToCloud &&
    active.backend.kind === "cloud" &&
    isSameCloudHost(active.backend.host, lockedCloudHost);
  const { isCompleted: onboardingCompleted, markCompleted } =
    useOnboardingCompletion();

  // In locked-to-Cloud mode the `openhands-onboarded` localStorage flag is
  // not trustworthy: it may have been set during a previous non-locked
  // session on the same origin, and origin-scoped localStorage cannot tell
  // the two deployments apart. So when the active backend is not the locked
  // Cloud host we ignore the completion flag and force first-run onboarding
  // (which owns the Cloud login). A stale completion flag must never strand
  // the user on the Manage Backends recovery modal ("Add Backend") in locked
  // mode.
  //
  // Once the active backend IS the locked Cloud host, a Cloud login that
  // just succeeded (markCompleted fired via the onboarding modal's onClose)
  // must hide first-run onboarding immediately. Treating
  // `onboardingCompleted` as authoritative once the locked Cloud backend is
  // active suppresses reopen flicker. (The flag is only honored when the
  // active backend really is the locked Cloud host, so the stale-flag bypass
  // concerns above don't apply here.)
  const shouldCheckMainAppAuth = shouldUseMainAppCookieAuth();
  const showFirstRunOnboarding = isLockedToCloud
    ? !shouldCheckMainAppAuth &&
      (!isActiveLockedCloudBackend ||
        (lockedCloudAuthMode !== "cookie" && !onboardingCompleted))
    : !onboardingCompleted;
  const mainAppAuth = useQuery({
    queryKey: QUERY_KEYS.MAIN_APP_COOKIE_AUTH,
    queryFn: authenticateWithMainAppCookie,
    enabled: shouldCheckMainAppAuth && !showFirstRunOnboarding,
    retry: false,
    staleTime: 1000 * 60 * 5,
    meta: { disableToast: true },
  });
  const waitingForMainAppAuth =
    shouldCheckMainAppAuth &&
    !showFirstRunOnboarding &&
    mainAppAuth.isPending &&
    !mainAppAuth.isError;
  const redirectingToMainAppLogin =
    shouldCheckMainAppAuth && mainAppAuth.data === false;
  const mainAppAuthAllowsBackendQueries =
    !shouldCheckMainAppAuth || mainAppAuth.data === true || mainAppAuth.isError;

  React.useEffect(() => {
    if (redirectingToMainAppLogin) redirectToMainAppLogin();
  }, [redirectingToMainAppLogin]);

  // Skip the /server_info probe entirely when we already know auth is
  // required and missing — it would just 401 and waste time. Also keep the
  // root bootstrap quiet while the first-run onboarding modal owns backend
  // collection; the onboarding steps issue their own backend-specific queries.
  const config = useConfig({
    enabled:
      !authMissing &&
      !showFirstRunOnboarding &&
      mainAppAuthAllowsBackendQueries,
  });
  const activeCloudHealth = useBackendsHealth(
    active.backend.kind === "cloud" && mainAppAuthAllowsBackendQueries
      ? [active.backend]
      : [],
  )[active.backend.id];
  const activeCloudLoggedOut =
    active.backend.kind === "cloud" &&
    activeCloudHealth?.isConnected === false &&
    isCloudBackendLoggedOutHealthError(activeCloudHealth.lastError);
  // A cloud backend the health probe has given up on (disabled after repeated
  // CORS/network failures) is unreachable from this origin — most commonly a
  // self-hosted OHE that doesn't allow this frontend's origin. Route to the
  // same recovery screen as a logged-out backend so the user sees the real
  // connectivity error, not a misleading "LLM not configured" home page.
  const activeCloudUnreachable =
    active.backend.kind === "cloud" &&
    activeCloudHealth?.disabled === true &&
    isCloudBackendApiKeyOrNetworkHealthError(activeCloudHealth.lastError);

  if (showFirstRunOnboarding) {
    return (
      <>
        <FirstRunOnboardingScreen onClose={markCompleted} />
        <TelemetryConsentBanner />
      </>
    );
  }

  if (waitingForMainAppAuth || redirectingToMainAppLogin) {
    return <AgentServerBootstrapLoading />;
  }

  // No key at all after onboarding was skipped/completed → auth screen.
  // Stale key → /server_info 401 → auth screen (public mode only).
  if (authMissing || isAgentServerAuthError(config.error)) {
    return (
      <React.Suspense fallback={<AgentServerBootstrapLoading />}>
        <ApiKeyEntryScreen />
      </React.Suspense>
    );
  }

  if (config.isPending || config.isLoading) {
    return <AgentServerBootstrapLoading />;
  }

  if (
    activeCloudLoggedOut ||
    activeCloudUnreachable ||
    isAgentServerUnavailableError(config.error)
  ) {
    return <MissingAgentServerScreen />;
  }

  return (
    <>
      <Outlet />
      <TelemetryConsentBanner />
    </>
  );
}

/* eslint-disable i18next/no-literal-string */
export function ErrorBoundary() {
  const error = useRouteError();

  React.useEffect(() => {
    if (isChunkLoadError(error)) {
      reloadOnChunkError();
    }
  }, [error]);

  if (isRouteErrorResponse(error)) {
    return (
      <main className="min-h-screen bg-base flex flex-col items-center justify-center p-6 text-white text-center">
        <div className="max-w-md rounded-2xl border border-white/10 bg-base/80 p-8 shadow-2xl space-y-4">
          <h2 className="text-xl font-bold">
            {error.status} {error.statusText}
          </h2>
          <p className="text-sm text-neutral-400">
            {error.data instanceof Object
              ? JSON.stringify(error.data)
              : String(error.data || "")}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 cursor-pointer"
          >
            Reload Page
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-base flex flex-col items-center justify-center p-6 text-white text-center">
      <div className="max-w-md rounded-2xl border border-white/10 bg-base/80 p-8 shadow-2xl space-y-4">
        <h2 className="text-xl font-bold">Application Error</h2>
        <p className="text-sm text-neutral-400">
          {error instanceof Error
            ? error.message
            : "An unexpected error occurred while loading the application."}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 cursor-pointer"
        >
          Reload Page
        </button>
      </div>
    </main>
  );
}

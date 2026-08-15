import React from "react";

/**
 * Datadog RUM + Browser Logs provider.
 *
 * Initialises the Datadog browser SDKs when the required VITE_DD_*
 * environment variables are present. Runs alongside the existing
 * PostHog TelemetryProvider — they are independent.
 *
 * Required env vars (set as Coolify Build Variables):
 *   VITE_DD_APPLICATION_ID  — RUM Application ID from Datadog
 *   VITE_DD_CLIENT_TOKEN    — Client Token from Datadog
 *
 * Optional:
 *   VITE_DD_SITE            — Datadog site (default: datadoghq.com)
 *   VITE_DD_ENV             — Environment tag (default: production)
 *   VITE_DD_SESSION_SAMPLE_RATE      — RUM session sample rate 0–100 (default: 100)
 *   VITE_DD_SESSION_REPLAY_SAMPLE_RATE — Session Replay rate 0–100 (default: 20)
 */

const DD_APPLICATION_ID = import.meta.env.VITE_DD_APPLICATION_ID as
  | string
  | undefined;
const DD_CLIENT_TOKEN = import.meta.env.VITE_DD_CLIENT_TOKEN as
  | string
  | undefined;
const DD_SITE = (import.meta.env.VITE_DD_SITE as string) || "datadoghq.com";
const DD_ENV = (import.meta.env.VITE_DD_ENV as string) || "production";
const DD_SESSION_SAMPLE_RATE = Number(
  import.meta.env.VITE_DD_SESSION_SAMPLE_RATE ?? "100",
);
const DD_SESSION_REPLAY_SAMPLE_RATE = Number(
  import.meta.env.VITE_DD_SESSION_REPLAY_SAMPLE_RATE ?? "20",
);

let ddInitialised = false;

async function initDatadog() {
  if (ddInitialised) return;
  if (!DD_APPLICATION_ID || !DD_CLIENT_TOKEN) return;
  ddInitialised = true;

  // Dynamic imports so the SDK is tree-shaken when env vars are absent
  const [{ datadogRum }, { datadogLogs }] = await Promise.all([
    import("@datadog/browser-rum"),
    import("@datadog/browser-logs"),
  ]);

  datadogRum.init({
    applicationId: DD_APPLICATION_ID,
    clientToken: DD_CLIENT_TOKEN,
    site: DD_SITE,
    service: "grokbot-frontend",
    env: DD_ENV,
    sessionSampleRate: DD_SESSION_SAMPLE_RATE,
    sessionReplaySampleRate: DD_SESSION_REPLAY_SAMPLE_RATE,
    trackUserInteractions: true,
    trackResources: true,
    trackLongTasks: true,
    defaultPrivacyLevel: "mask-user-input",
  });

  datadogLogs.init({
    clientToken: DD_CLIENT_TOKEN,
    site: DD_SITE,
    service: "grokbot-frontend",
    env: DD_ENV,
    forwardErrorsToLogs: true,
    sessionSampleRate: 100,
  });
}

export function DatadogProvider({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    void initDatadog().catch(() => {
      // Datadog is optional; never block the app.
    });
  }, []);

  return <>{children}</>;
}

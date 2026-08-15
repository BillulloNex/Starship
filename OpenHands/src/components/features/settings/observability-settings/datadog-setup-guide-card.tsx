import React from "react";
import { AlertCircle, Key, ArrowUpRight, CheckCircle2 } from "lucide-react";

export interface DatadogSetupGuideCardProps {
  site?: string;
  hasApiKey?: boolean;
  hasAppKey?: boolean;
}

export function DatadogSetupGuideCard({
  site = "us5.datadoghq.com",
  hasApiKey = false,
  hasAppKey = false,
}: DatadogSetupGuideCardProps) {
  const appKeysUrl = `https://${site}/organization-settings/application-keys`;

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 text-sm space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex items-center justify-center size-8 rounded-lg bg-amber-500/20 text-amber-300 shrink-0">
          <Key className="size-4" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">
            Datadog Application Key Required for Dashboard
          </h3>
          <p className="text-xs text-[var(--oh-muted)] mt-1">
            While <span className="font-mono text-amber-200">DD_API_KEY</span>{" "}
            allows Grokbot to push logs and traces to Datadog, reading those
            statistics back into this screen requires an Application Key (
            <span className="font-mono text-amber-200">DD_APP_KEY</span>).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
        <div className="p-3 rounded-lg border border-[var(--oh-border)] bg-surface text-xs space-y-2">
          <div className="flex items-center justify-between font-semibold text-foreground">
            <span>1. Generate Key in Datadog</span>
            <a
              href={appKeysUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-sky-400 hover:text-sky-300 font-normal"
            >
              <span>Open Datadog</span>
              <ArrowUpRight className="size-3" />
            </a>
          </div>
          <p className="text-[var(--oh-muted)]">
            Go to <strong>Organization Settings → Application Keys</strong>,
            click <strong>+ New Key</strong>, name it{" "}
            <code className="px-1 py-0.5 rounded bg-black/40 text-sky-300">
              grokbot-dashboard
            </code>
            , and copy the key value.
          </p>
        </div>

        <div className="p-3 rounded-lg border border-[var(--oh-border)] bg-surface text-xs space-y-2">
          <div className="font-semibold text-foreground">
            <span>2. Save to Coolify Environment</span>
          </div>
          <p className="text-[var(--oh-muted)]">
            In Coolify, add a new environment variable:
            <br />
            <strong>Key:</strong>{" "}
            <code className="text-amber-300">DD_APP_KEY</code>
            <br />
            <strong>Value:</strong> (paste your generated key)
            <br />
            <strong>Available at Runtime:</strong> ✅ Checked
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs pt-2 border-t border-amber-500/20 text-[var(--oh-muted)]">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            {hasApiKey ? (
              <CheckCircle2 className="size-3.5 text-emerald-400" />
            ) : (
              <AlertCircle className="size-3.5 text-rose-400" />
            )}
            <span>DD_API_KEY: {hasApiKey ? "Set" : "Missing"}</span>
          </span>
          <span className="flex items-center gap-1">
            {hasAppKey ? (
              <CheckCircle2 className="size-3.5 text-emerald-400" />
            ) : (
              <AlertCircle className="size-3.5 text-amber-400" />
            )}
            <span>DD_APP_KEY: {hasAppKey ? "Set" : "Missing"}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

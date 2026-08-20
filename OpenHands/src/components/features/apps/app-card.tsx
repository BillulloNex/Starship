import React, { useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Folder,
  Globe,
  Play,
  Square,
  Terminal,
  Trash2,
  AlertCircle,
} from "lucide-react";
import { type AppRecord, useStartApp, useStopApp, useDeleteApp } from "#/hooks/query/use-apps";
import { cn } from "#/utils/utils";
import { displaySuccessToast, displayErrorToast } from "#/utils/custom-toast-handlers";

interface AppCardProps {
  app: AppRecord;
}

export function AppCard({ app }: AppCardProps) {
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const startMutation = useStartApp();
  const stopMutation = useStopApp();
  const deleteMutation = useDeleteApp();

  const isOperating =
    startMutation.isPending || stopMutation.isPending || deleteMutation.isPending;

  const handleCopy = async (url: string, label: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(url);
      displaySuccessToast(`Copied ${label} link!`);
      setTimeout(() => setCopiedLink(null), 2000);
    } catch {
      displayErrorToast("Failed to copy to clipboard");
    }
  };

  const handleToggleState = async () => {
    try {
      if (app.is_listening) {
        await stopMutation.mutateAsync(app.name);
        displaySuccessToast(`Stopped "${app.title || app.name}"`);
      } else {
        await startMutation.mutateAsync(app.name);
        displaySuccessToast(`Started "${app.title || app.name}"`);
      }
    } catch (err: any) {
      displayErrorToast(err?.message || "Failed to update app state");
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 4000);
      return;
    }
    try {
      await deleteMutation.mutateAsync(app.name);
      displaySuccessToast(`Unregistered "${app.name}"`);
    } catch (err: any) {
      displayErrorToast(err?.message || "Failed to unregister app");
    }
  };

  const primaryUrl = app.url_space || `https://${app.name}.beenex.space`;
  const mirrorUrl = app.url_org || `https://${app.name}.beenex.org`;

  return (
    <div
      data-testid={`app-card-${app.name}`}
      className={cn(
        "group relative flex flex-col justify-between rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-raised)] p-5 shadow-sm transition-all duration-200 hover:border-[var(--oh-border-hover)] hover:shadow-md",
        app.is_listening
          ? "border-l-4 border-l-emerald-500/80"
          : "border-l-4 border-l-[var(--oh-border)] opacity-85",
      )}
    >
      <div>
        {/* Header: Title & Status */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-base font-semibold text-foreground">
                {app.title || app.name}
              </h3>
              <span className="shrink-0 rounded-md bg-[var(--oh-surface)] px-2 py-0.5 text-xs font-mono text-[var(--oh-text-secondary)] border border-[var(--oh-border)]">
                :{app.port}
              </span>
            </div>
            <p className="mt-0.5 truncate text-xs text-[var(--oh-muted)] font-mono">
              {app.name}
            </p>
          </div>

          {/* Status Badge */}
          <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--oh-surface)] px-2.5 py-1 text-xs font-medium border border-[var(--oh-border)]">
            <span
              className={cn(
                "size-2 rounded-full",
                app.is_listening
                  ? "bg-emerald-500 animate-pulse"
                  : "bg-neutral-500",
              )}
            />
            <span
              className={
                app.is_listening
                  ? "text-emerald-400 font-medium"
                  : "text-[var(--oh-muted)]"
              }
            >
              {app.is_listening ? "Live" : "Stopped"}
            </span>
          </div>
        </div>

        {/* Shareable Link Box */}
        <div className="mt-4 rounded-lg bg-[var(--oh-surface)] p-3 border border-[var(--oh-border)]">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Globe className="size-4 shrink-0 text-sky-400" />
              <a
                href={primaryUrl}
                target="_blank"
                rel="noreferrer"
                className="truncate text-xs font-medium text-sky-400 hover:text-sky-300 hover:underline font-mono"
                title={primaryUrl}
              >
                {primaryUrl}
              </a>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => handleCopy(primaryUrl, "primary")}
                className="inline-flex size-7 items-center justify-center rounded-md text-[var(--oh-text-tertiary)] hover:bg-[var(--oh-surface-raised)] hover:text-foreground transition-colors"
                title="Copy shareable link"
              >
                {copiedLink === primaryUrl ? (
                  <Check className="size-3.5 text-emerald-400" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </button>
              <a
                href={primaryUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex size-7 items-center justify-center rounded-md text-[var(--oh-text-tertiary)] hover:bg-[var(--oh-surface-raised)] hover:text-foreground transition-colors"
                title="Open in new tab"
              >
                <ExternalLink className="size-3.5" />
              </a>
            </div>
          </div>

          {/* Mirror domain hint */}
          <div className="mt-1.5 flex items-center justify-between pt-1.5 border-t border-[var(--oh-border)]/50 text-[11px] text-[var(--oh-muted)]">
            <span className="truncate">Mirror: {mirrorUrl}</span>
            <button
              type="button"
              onClick={() => handleCopy(mirrorUrl, "mirror")}
              className="text-[var(--oh-text-secondary)] hover:text-foreground text-[10px] underline ml-2 shrink-0"
            >
              {copiedLink === mirrorUrl ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>

        {/* Metadata Details */}
        <div className="mt-3.5 space-y-1.5 text-xs text-[var(--oh-muted)]">
          {app.dir && (
            <div className="flex items-center gap-1.5 truncate">
              <Folder className="size-3.5 shrink-0 text-[var(--oh-text-tertiary)]" />
              <span className="truncate font-mono text-[11px]">{app.dir}</span>
            </div>
          )}
          {app.start_cmd && (
            <div className="flex items-center gap-1.5 truncate">
              <Terminal className="size-3.5 shrink-0 text-[var(--oh-text-tertiary)]" />
              <span className="truncate font-mono text-[11px] text-[var(--oh-text-secondary)]">
                {app.start_cmd}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Footer Controls */}
      <div className="mt-5 flex items-center justify-between border-t border-[var(--oh-border)] pt-3.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isOperating}
            onClick={handleToggleState}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150 disabled:opacity-50 cursor-pointer shadow-sm",
              app.is_listening
                ? "bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 border border-amber-500/30"
                : "bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 border border-emerald-500/30",
            )}
          >
            {app.is_listening ? (
              <>
                <Square className="size-3 fill-current" />
                <span>Stop</span>
              </>
            ) : (
              <>
                <Play className="size-3 fill-current" />
                <span>Start</span>
              </>
            )}
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={isOperating}
            onClick={handleDelete}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs transition-colors cursor-pointer",
              confirmDelete
                ? "bg-red-500/20 text-red-300 font-semibold border border-red-500/40"
                : "text-[var(--oh-muted)] hover:bg-[var(--oh-surface)] hover:text-red-400",
            )}
            title="Unregister app"
          >
            <Trash2 className="size-3.5" />
            {confirmDelete && <span>Confirm Delete</span>}
          </button>
        </div>
      </div>
    </div>
  );
}

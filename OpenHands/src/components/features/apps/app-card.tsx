/* eslint-disable i18next/no-literal-string */
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
  Zap,
  FileText,
  X,
  RotateCw,
  GitBranch,
} from "lucide-react";
import {
  type AppRecord,
  useStartApp,
  useStopApp,
  useDeleteApp,
  useAppLogs,
} from "#/hooks/query/use-apps";
import { cn } from "#/utils/utils";
import { displaySuccessToast, displayErrorToast } from "#/utils/custom-toast-handlers";

interface AppCardProps {
  app: AppRecord;
}

export function AppCard({ app }: AppCardProps) {
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  const startMutation = useStartApp();
  const stopMutation = useStopApp();
  const deleteMutation = useDeleteApp();
  const logsQuery = useAppLogs(app.name, showLogs);

  const isOperating =
    startMutation.isPending || stopMutation.isPending || deleteMutation.isPending;

  const isStatic = app.type === "static";

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

  const primaryUrl = isStatic
    ? app.url || `https://${app.name}.pages.dev`
    : app.url_port || (app.port ? `https://p${app.port}.beenex.org` : `https://${app.name}.beenex.space`);
  const subdomainUrl = isStatic
    ? app.url || `https://${app.name}.pages.dev`
    : app.url_space || `https://${app.name}.beenex.space`;

  return (
    <>
      <div
        data-testid={`app-card-${app.name}`}
        className={cn(
          "group relative flex flex-col justify-between rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-raised)] p-5 shadow-sm transition-all duration-200 hover:border-[var(--oh-border-hover)] hover:shadow-md",
          isStatic
            ? "border-l-4 border-l-orange-500/90"
            : app.is_listening
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
                {isStatic ? (
                  <span className="shrink-0 inline-flex items-center gap-1 rounded-md bg-orange-500/10 px-2 py-0.5 text-[11px] font-semibold text-orange-400 border border-orange-500/20">
                    <Zap className="size-3" />
                    <span>Pages Edge</span>
                  </span>
                ) : (
                  app.port && (
                    <span className="shrink-0 rounded-md bg-[var(--oh-surface)] px-2 py-0.5 text-xs font-mono text-[var(--oh-text-secondary)] border border-[var(--oh-border)]">
                      :{app.port}
                    </span>
                  )
                )}
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
                  isStatic
                    ? "bg-orange-500"
                    : app.is_listening
                      ? "bg-emerald-500 animate-pulse"
                      : "bg-neutral-500",
                )}
              />
              <span
                className={
                  isStatic
                    ? "text-orange-400 font-medium"
                    : app.is_listening
                      ? "text-emerald-400 font-medium"
                      : "text-[var(--oh-muted)]"
                }
              >
                {isStatic ? "24/7 Global" : app.is_listening ? "Live" : "Stopped"}
              </span>
            </div>
          </div>

          {/* Shareable Link Box */}
          <div className="mt-4 rounded-lg bg-[var(--oh-surface)] p-3 border border-[var(--oh-border)]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {isStatic ? (
                  <Zap className="size-4 shrink-0 text-orange-400" />
                ) : (
                  <Globe className="size-4 shrink-0 text-sky-400" />
                )}
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
                  className="inline-flex size-7 items-center justify-center rounded-md text-[var(--oh-text-tertiary)] hover:bg-[var(--oh-surface-raised)] hover:text-foreground transition-colors cursor-pointer"
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

            {/* Subdomain / Mirror hint if dynamic */}
            {!isStatic && (
              <div className="mt-1.5 flex items-center justify-between pt-1.5 border-t border-[var(--oh-border)]/50 text-[11px] text-[var(--oh-muted)]">
                <span className="truncate">Named: {subdomainUrl}</span>
                <button
                  type="button"
                  onClick={() => handleCopy(subdomainUrl, "subdomain")}
                  className="text-[var(--oh-text-secondary)] hover:text-foreground text-[10px] underline ml-2 shrink-0 cursor-pointer"
                >
                  {copiedLink === subdomainUrl ? "Copied!" : "Copy"}
                </button>
              </div>
            )}
          </div>

          {/* Metadata Details */}
          <div className="mt-3.5 space-y-1.5 text-xs text-[var(--oh-muted)]">
            {app.dir && (
              <div className="flex items-center gap-1.5 truncate">
                <Folder className="size-3.5 shrink-0 text-[var(--oh-text-tertiary)]" />
                <span className="truncate font-mono text-[11px]">{app.dir}</span>
              </div>
            )}
            {app.branch && (
              <div className="flex items-center gap-1.5 truncate">
                <GitBranch className="size-3.5 shrink-0 text-[var(--oh-text-tertiary)]" />
                <span className="truncate font-mono text-[11px] text-[var(--oh-text-secondary)]">
                  branch: {app.branch}
                </span>
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
            {!isStatic ? (
              <>
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
                <button
                  type="button"
                  onClick={() => setShowLogs(true)}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface-raised)] hover:text-foreground transition-colors cursor-pointer"
                  title="View process stdout/stderr logs"
                >
                  <FileText className="size-3" />
                  <span>Logs</span>
                </button>
              </>
            ) : (
              <a
                href={primaryUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 text-orange-300 border border-orange-500/30 px-3 py-1.5 text-xs font-semibold shadow-sm transition-colors cursor-pointer"
              >
                <ExternalLink className="size-3" />
                <span>Visit Live App</span>
              </a>
            )}
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

      {/* Logs Drawer Modal */}
      {showLogs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-[var(--oh-border)] bg-[var(--oh-surface-raised)] p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-[var(--oh-border)] pb-3">
              <div className="flex items-center gap-2">
                <Terminal className="size-4 text-sky-400" />
                <h3 className="text-sm font-bold text-foreground">
                  Process Output: <span className="font-mono text-sky-400">{app.name}</span>
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => logsQuery.refetch()}
                  disabled={logsQuery.isFetching}
                  className="rounded-lg p-1.5 text-[var(--oh-muted)] hover:text-foreground hover:bg-[var(--oh-surface)] cursor-pointer"
                  title="Refresh logs"
                >
                  <RotateCw className={cn("size-3.5", logsQuery.isFetching && "animate-spin")} />
                </button>
                <button
                  type="button"
                  onClick={() => setShowLogs(false)}
                  className="rounded-lg p-1.5 text-[var(--oh-muted)] hover:text-foreground hover:bg-[var(--oh-surface)] cursor-pointer"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto rounded-lg bg-black/80 p-4 font-mono text-xs text-neutral-200 border border-[var(--oh-border)] whitespace-pre-wrap">
              {logsQuery.isLoading
                ? "Loading logs..."
                : logsQuery.data?.log || "(No logs available for this application yet.)"}
            </div>

            <div className="flex items-center justify-between text-[11px] text-[var(--oh-muted)] pt-1">
              <span>Auto-refreshing while open</span>
              <button
                type="button"
                onClick={() => setShowLogs(false)}
                className="rounded-lg bg-[var(--oh-surface)] border border-[var(--oh-border)] px-3 py-1 text-xs text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface-raised)] hover:text-foreground cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* eslint-disable i18next/no-literal-string, jsx-a11y/label-has-associated-control */
import React, { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import {
  Globe,
  Search,
  RotateCw,
  Plus,
  ExternalLink,
  Sparkles,
  Server,
  Zap,
  Check,
  Copy,
  ScanLine,
} from "lucide-react";
import {
  useApps,
  useRegisterApp,
  useScanApps,
  type AppRecord,
} from "#/hooks/query/use-apps";
import { AppCard } from "#/components/features/apps/app-card";
import { cn } from "#/utils/utils";
import {
  displaySuccessToast,
  displayErrorToast,
} from "#/utils/custom-toast-handlers";

type FilterTab = "all" | "edge" | "running" | "stopped";

export default function AppsScreen() {
  const { t } = useTranslation("openhands");
  const navigate = useNavigate();
  const { data, isLoading, refetch, isFetching } = useApps();
  const scanMutation = useScanApps();

  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [modalAppType, setModalAppType] = useState<"dynamic" | "static">("dynamic");
  const [modalPort, setModalPort] = useState<number | string>("");
  const [modalName, setModalName] = useState("");
  const [modalTitle, setModalTitle] = useState("");
  const [modalDir, setModalDir] = useState("");
  const [modalStartCmd, setModalStartCmd] = useState("");
  const [modalUrl, setModalUrl] = useState("");

  const registerMutation = useRegisterApp();

  const apps = useMemo(() => data?.apps || [], [data?.apps]);
  const unassignedPorts = useMemo(
    () => data?.unassignedPorts || [],
    [data?.unassignedPorts],
  );

  const edgeCount = useMemo(
    () => apps.filter((a) => a.type === "static").length,
    [apps],
  );
  const runningCount = useMemo(
    () => apps.filter((a) => a.type !== "static" && a.is_listening).length,
    [apps],
  );
  const stoppedCount = useMemo(
    () => apps.filter((a) => a.type !== "static" && !a.is_listening).length,
    [apps],
  );

  const filteredApps = useMemo(() => {
    return apps.filter((app) => {
      // Tab filter
      if (filterTab === "edge" && app.type !== "static") return false;
      if (filterTab === "running" && (app.type === "static" || !app.is_listening)) return false;
      if (filterTab === "stopped" && (app.type === "static" || app.is_listening)) return false;

      // Search filter
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase();
      return (
        app.name.toLowerCase().includes(query) ||
        (app.title && app.title.toLowerCase().includes(query)) ||
        (app.port && String(app.port).includes(query)) ||
        (app.url && app.url.toLowerCase().includes(query)) ||
        (app.dir && app.dir.toLowerCase().includes(query)) ||
        (app.start_cmd && app.start_cmd.toLowerCase().includes(query))
      );
    });
  }, [apps, filterTab, searchQuery]);

  const handleScanWorkspace = async () => {
    try {
      const res = await scanMutation.mutateAsync();
      if (res.count > 0) {
        displaySuccessToast(`Discovered and registered ${res.count} new project(s)!`);
      } else {
        displaySuccessToast("Workspace scanned. All projects up to date.");
      }
    } catch (err: any) {
      displayErrorToast(err?.message || "Failed to scan workspace");
    }
  };

  const handleOpenRegisterForPort = (port: number) => {
    setModalAppType("dynamic");
    setModalPort(port);
    setModalName(`app-${port}`);
    setModalTitle(`Web App (Port ${port})`);
    setModalDir(`/projects`);
    setModalStartCmd("");
    setModalUrl("");
    setIsRegisterModalOpen(true);
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalName.trim()) {
      displayErrorToast("Please provide an app name slug.");
      return;
    }

    if (modalAppType === "dynamic" && !modalPort) {
      displayErrorToast("Please specify a port for dynamic container apps.");
      return;
    }

    try {
      if (modalAppType === "static") {
        await registerMutation.mutateAsync({
          type: "static",
          name: modalName.trim(),
          title: modalTitle.trim() || modalName.trim(),
          url: modalUrl.trim() || `https://${modalName.trim()}.pages.dev`,
          dir: modalDir.trim() || undefined,
        });
        displaySuccessToast(`Static app "${modalName}" registered!`);
      } else {
        await registerMutation.mutateAsync({
          type: "dynamic",
          name: modalName.trim(),
          port: Number(modalPort),
          title: modalTitle.trim() || modalName.trim(),
          dir: modalDir.trim() || undefined,
          start_cmd: modalStartCmd.trim() || undefined,
        });
        displaySuccessToast(`Dynamic app "${modalName}" registered!`);
      }

      setIsRegisterModalOpen(false);
      setModalName("");
      setModalPort("");
      setModalTitle("");
      setModalDir("");
      setModalStartCmd("");
      setModalUrl("");
    } catch (err: any) {
      displayErrorToast(err?.message || "Failed to register app");
    }
  };

  const starterPrompts = [
    "Make me a retro 80s arcade game and deploy it with grokbot-deploy",
    "Build a neon mario platformer game with a shareable Cloudflare Pages link",
    "Create a modern markdown note-taking web app and make it shareable",
    "Build an interactive dashboard with live charts and a public URL",
  ];

  return (
    <main
      data-testid="apps-screen"
      className="h-full flex-1 overflow-y-auto p-6 md:p-8"
    >
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--oh-border)]">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <Globe className="size-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">
                Web Apps & Shareable Links
              </h1>
              <p className="text-xs text-[var(--oh-muted)]">
                Track and share live container servers (
                <span className="font-mono text-sky-400">p*.beenex.org</span>) &
                permanent edge deployments (
                <span className="font-mono text-orange-400">*.pages.dev</span>)
              </p>
            </div>
          </div>

          {/* Top Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleScanWorkspace}
              disabled={scanMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 py-1.5 text-xs font-medium text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface-raised)] hover:text-foreground transition-colors cursor-pointer"
              title="Scan workspace folders for newly created projects"
            >
              <ScanLine
                className={cn("size-3.5", scanMutation.isPending && "animate-pulse")}
              />
              <span>{scanMutation.isPending ? "Scanning..." : "Scan Workspace"}</span>
            </button>

            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 py-1.5 text-xs font-medium text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface-raised)] hover:text-foreground transition-colors cursor-pointer"
            >
              <RotateCw
                className={cn("size-3.5", isFetching && "animate-spin")}
              />
              <span>Refresh</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setModalAppType("dynamic");
                setModalPort("");
                setModalName("");
                setModalTitle("");
                setModalDir("/projects/");
                setModalStartCmd("");
                setModalUrl("");
                setIsRegisterModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white px-3.5 py-1.5 text-xs font-semibold shadow-sm transition-colors cursor-pointer"
            >
              <Plus className="size-3.5" />
              <span>Register App</span>
            </button>
          </div>
        </div>

        {/* Stats & Filter Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[var(--oh-text-tertiary)]" />
            <input
              type="text"
              placeholder="Search apps by name, port, domain, folder..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] pl-9 pr-4 py-2 text-xs text-foreground placeholder:text-[var(--oh-muted)] focus:border-sky-500 focus:outline-none transition-colors"
            />
          </div>

          {/* Filter Segmented Control */}
          <div className="inline-flex items-center rounded-lg bg-[var(--oh-surface)] p-1 border border-[var(--oh-border)]">
            <button
              type="button"
              onClick={() => setFilterTab("all")}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors cursor-pointer",
                filterTab === "all"
                  ? "bg-[var(--oh-surface-raised)] text-foreground shadow-sm"
                  : "text-[var(--oh-muted)] hover:text-foreground",
              )}
            >
              All ({apps.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab("edge")}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5",
                filterTab === "edge"
                  ? "bg-[var(--oh-surface-raised)] text-foreground shadow-sm"
                  : "text-[var(--oh-muted)] hover:text-foreground",
              )}
            >
              <span className="size-1.5 rounded-full bg-orange-500" />
              Pages Edge ({edgeCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab("running")}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5",
                filterTab === "running"
                  ? "bg-[var(--oh-surface-raised)] text-foreground shadow-sm"
                  : "text-[var(--oh-muted)] hover:text-foreground",
              )}
            >
              <span className="size-1.5 rounded-full bg-emerald-500" />
              Live Dev ({runningCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab("stopped")}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors cursor-pointer",
                filterTab === "stopped"
                  ? "bg-[var(--oh-surface-raised)] text-foreground shadow-sm"
                  : "text-[var(--oh-muted)] hover:text-foreground",
              )}
            >
              Stopped ({stoppedCount})
            </button>
          </div>
        </div>

        {/* Unassigned Listening Ports Banner (if any) */}
        {unassignedPorts.length > 0 && (
          <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-sky-500/10 p-2 text-sky-400 border border-sky-500/20">
                  <Zap className="size-4" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground">
                    Active Server Detected on Unregistered Port(s)
                  </h4>
                  <p className="text-xs text-[var(--oh-muted)] mt-0.5">
                    GrokBot detected background server(s) answering requests. You can
                    open them directly or register a custom subdomain.
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {unassignedPorts.map((port) => (
                      <div
                        key={port}
                        className="inline-flex items-center gap-2 rounded-lg bg-[var(--oh-surface)] border border-[var(--oh-border)] px-2.5 py-1 text-xs"
                      >
                        <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="font-mono font-medium">:{port}</span>
                        <a
                          href={`https://p${port}.beenex.org`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sky-400 hover:underline flex items-center gap-0.5 ml-1"
                        >
                          <span>Open</span>
                          <ExternalLink className="size-3" />
                        </a>
                        <button
                          type="button"
                          onClick={() => handleOpenRegisterForPort(port)}
                          className="text-xs text-foreground font-semibold hover:text-sky-300 ml-1.5 border-l border-[var(--oh-border)] pl-2 cursor-pointer"
                        >
                          Name App
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Apps Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-44 rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-raised)] animate-pulse"
              />
            ))}
          </div>
        ) : filteredApps.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredApps.map((app) => (
              <AppCard key={app.name} app={app} />
            ))}
          </div>
        ) : (
          /* Empty State */
          <div className="rounded-2xl border border-[var(--oh-border)] bg-[var(--oh-surface-raised)] p-8 text-center sm:p-12">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <Globe className="size-7" />
            </div>
            <h3 className="mt-4 text-base font-bold text-foreground">
              {apps.length === 0
                ? "No Web Apps Created Yet"
                : "No matching apps found"}
            </h3>
            <p className="mx-auto mt-1.5 max-w-md text-xs text-[var(--oh-muted)]">
              {apps.length === 0
                ? "Ask GrokBot in any conversation to create a website, game, or web application with a shareable link!"
                : "Try adjusting your search query or switching filters."}
            </p>

            {apps.length === 0 && (
              <div className="mx-auto mt-6 max-w-lg">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--oh-text-tertiary)] mb-2.5">
                  Try asking in chat:
                </p>
                <div className="grid grid-cols-1 gap-2 text-left">
                  {starterPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => navigate("/conversations")}
                      className="group flex items-center justify-between rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface)] p-3 text-xs text-[var(--oh-text-secondary)] hover:border-sky-500/50 hover:bg-sky-500/5 hover:text-foreground transition-all cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <Sparkles className="size-3.5 text-sky-400 group-hover:rotate-12 transition-transform" />
                        <span>"{prompt}"</span>
                      </div>
                      <span className="text-[10px] text-[var(--oh-muted)] group-hover:text-sky-400 font-medium">
                        Start →
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Manual App Register Modal */}
      {isRegisterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--oh-border)] bg-[var(--oh-surface-raised)] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-foreground">
                Register Web Application
              </h3>
              <button
                type="button"
                onClick={() => setIsRegisterModalOpen(false)}
                className="text-[var(--oh-muted)] hover:text-foreground text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Type selector */}
            <div className="grid grid-cols-2 gap-2 bg-[var(--oh-surface)] p-1 rounded-lg border border-[var(--oh-border)]">
              <button
                type="button"
                onClick={() => setModalAppType("dynamic")}
                className={cn(
                  "py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer",
                  modalAppType === "dynamic"
                    ? "bg-[var(--oh-surface-raised)] text-foreground shadow-xs"
                    : "text-[var(--oh-muted)] hover:text-foreground",
                )}
              >
                Container Port Server
              </button>
              <button
                type="button"
                onClick={() => setModalAppType("static")}
                className={cn(
                  "py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer",
                  modalAppType === "static"
                    ? "bg-[var(--oh-surface-raised)] text-foreground shadow-xs"
                    : "text-[var(--oh-muted)] hover:text-foreground",
                )}
              >
                Cloudflare Pages Edge
              </button>
            </div>

            <form onSubmit={handleRegisterSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-medium text-[var(--oh-text-secondary)] mb-1">
                  App Name Slug
                </label>
                <div className="flex items-center rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 py-2">
                  <input
                    type="text"
                    required
                    placeholder="e.g. mario-game"
                    value={modalName}
                    onChange={(e) => setModalName(e.target.value)}
                    className="w-full bg-transparent text-foreground placeholder:text-[var(--oh-muted)] focus:outline-none font-mono"
                  />
                  <span className="text-[var(--oh-muted)] font-mono text-[11px] shrink-0 ml-1">
                    {modalAppType === "static" ? ".pages.dev" : ".beenex.space"}
                  </span>
                </div>
              </div>

              {modalAppType === "dynamic" ? (
                <div>
                  <label className="block font-medium text-[var(--oh-text-secondary)] mb-1">
                    Port Number
                  </label>
                  <input
                    type="number"
                    required
                    placeholder="e.g. 3000"
                    value={modalPort}
                    onChange={(e) => setModalPort(e.target.value)}
                    className="w-full rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 py-2 text-foreground placeholder:text-[var(--oh-muted)] focus:outline-none font-mono"
                  />
                </div>
              ) : (
                <div>
                  <label className="block font-medium text-[var(--oh-text-secondary)] mb-1">
                    Direct Public URL (Optional)
                  </label>
                  <input
                    type="url"
                    placeholder={`https://${modalName || "mario-game"}.pages.dev`}
                    value={modalUrl}
                    onChange={(e) => setModalUrl(e.target.value)}
                    className="w-full rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 py-2 text-foreground placeholder:text-[var(--oh-muted)] focus:outline-none font-mono"
                  />
                </div>
              )}

              <div>
                <label className="block font-medium text-[var(--oh-text-secondary)] mb-1">
                  Display Title (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Neon Mario 3D"
                  value={modalTitle}
                  onChange={(e) => setModalTitle(e.target.value)}
                  className="w-full rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 py-2 text-foreground placeholder:text-[var(--oh-muted)] focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-medium text-[var(--oh-text-secondary)] mb-1">
                  Project Directory Path (Optional)
                </label>
                <input
                  type="text"
                  placeholder="/projects/mario-game"
                  value={modalDir}
                  onChange={(e) => setModalDir(e.target.value)}
                  className="w-full rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 py-2 text-foreground placeholder:text-[var(--oh-muted)] focus:outline-none font-mono"
                />
              </div>

              {modalAppType === "dynamic" && (
                <div>
                  <label className="block font-medium text-[var(--oh-text-secondary)] mb-1">
                    Start Command (Optional, for auto-restart on boot)
                  </label>
                  <input
                    type="text"
                    placeholder="npm run dev -- --port 3000 --host 0.0.0.0"
                    value={modalStartCmd}
                    onChange={(e) => setModalStartCmd(e.target.value)}
                    className="w-full rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 py-2 text-foreground placeholder:text-[var(--oh-muted)] focus:outline-none font-mono text-[11px]"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--oh-border)]">
                <button
                  type="button"
                  onClick={() => setIsRegisterModalOpen(false)}
                  className="rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 py-1.5 text-xs text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface-raised)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={registerMutation.isPending}
                  className="rounded-lg bg-sky-500 hover:bg-sky-400 text-white font-semibold px-4 py-1.5 text-xs shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {registerMutation.isPending ? "Saving..." : "Save App"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

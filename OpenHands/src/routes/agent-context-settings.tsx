import React, { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Brain,
  Sparkles,
  BookOpen,
  Cpu,
  Layers,
  Copy,
  Check,
  Search,
  Shield,
  FileText,
  Terminal,
  Database,
  Info,
} from "lucide-react";
import { BrandButton } from "#/components/features/settings/brand-button";
import { useSettings } from "#/hooks/query/use-settings";
import { useSaveSettings } from "#/hooks/mutation/use-save-settings";
import { useActiveAgentProfile } from "#/hooks/use-active-agent-profile";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import {
  displaySuccessToast,
  displayErrorToast,
} from "#/utils/custom-toast-handlers";
import { cn } from "#/utils/utils";

type ContextInspectorTab = "memory" | "prompt" | "skills" | "env";

export default function AgentContextSettingsScreen() {
  const { t } = useTranslation("openhands");
  const { data: settings, isLoading } = useSettings();
  const { activeProfile } = useActiveAgentProfile();
  const { data: conversation } = useActiveConversation();
  const { mutateAsync: saveSettings, isPending: isSaving } = useSaveSettings();

  const [activeTab, setActiveTab] = useState<ContextInspectorTab>("memory");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [skillSearchQuery, setSkillSearchQuery] = useState("");

  const agentContext = settings?.agent_settings?.agent_context as
    | Record<string, unknown>
    | undefined;
  const isLoadMemoryEnabled = agentContext?.load_memory !== false;

  const [customSuffix, setCustomSuffix] = useState<string>(
    typeof agentContext?.system_message_suffix === "string"
      ? (agentContext.system_message_suffix as string)
      : "",
  );

  // Sync suffix when settings load
  React.useEffect(() => {
    if (typeof agentContext?.system_message_suffix === "string") {
      setCustomSuffix(agentContext.system_message_suffix as string);
    }
  }, [agentContext?.system_message_suffix]);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    displaySuccessToast("Copied to clipboard!");
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleToggleMemory = async (checked: boolean) => {
    try {
      await saveSettings({
        agent_settings: {
          ...settings?.agent_settings,
          agent_context: {
            ...agentContext,
            load_memory: checked,
          },
        },
      });
      displaySuccessToast(
        checked
          ? "Workspace memory loading enabled."
          : "Workspace memory loading disabled.",
      );
    } catch (err: any) {
      displayErrorToast(err?.message || "Failed to update memory setting");
    }
  };

  const handleSaveSuffix = async () => {
    try {
      await saveSettings({
        agent_settings: {
          ...settings?.agent_settings,
          agent_context: {
            ...agentContext,
            system_message_suffix: customSuffix.trim() || undefined,
          } as any,
        },
      });
      displaySuccessToast("Agent context custom instructions saved!");
    } catch (err: any) {
      displayErrorToast(err?.message || "Failed to save context instructions");
    }
  };

  const systemInstructions =
    (activeProfile as any)?.system_prompt ||
    (settings?.agent_settings as any)?.system_prompt ||
    "You are Starship, an autonomous AI software engineer and system harness. You have full terminal, file, and browser tool execution capabilities to implement user objectives autonomously.";

  const runtimeServicesPreview = `<RUNTIME_SERVICES>
app_preview:
  enabled: true
  host_pattern: "p{port}.beenex.org"
  public_base: "https://ship.beenex.org"
observability:
  langfuse: active
  datadog: active
agent_harness: Starship Sovereign Cloud Harness
</RUNTIME_SERVICES>`;

  const sampleMemoryItems = [
    {
      name: "repo.md",
      path: ".openhands/microagents/repo.md",
      type: "Repository Knowledge",
      description:
        "Project guidelines, architecture overview, and operational constraints.",
      content:
        "# Project Context\n- Built on React 19, TypeScript, and TailwindCSS\n- Single sovereign cloud harness deployed on Cloudflare Pages and Coolify\n- Strict versioning required on all changes.",
    },
    {
      name: "verification.md",
      path: ".openhands/microagents/verification.md",
      type: "Verification Rules",
      description:
        "Verification checklist executed by the agent before declaring work complete.",
      content:
        "# Verification Protocol\n1. Run `npm run test`\n2. Run `npm run build`\n3. Check production health endpoints.",
    },
  ];

  const builtinSkills = [
    {
      name: "review-open-prs",
      category: "Workflows",
      description:
        "Fetches and performs autonomous code review on open GitHub Pull Requests.",
      triggers: ["review open PRs", "check PRs", "/review-pr"],
    },
    {
      name: "verify-observability",
      category: "Telemetry",
      description:
        "End-to-end smoke test for Langfuse traces, Datadog spans, and telemetry fanout.",
      triggers: ["verify observability", "check telemetry"],
    },
    {
      name: "deploy-to-cloudflare-pages",
      category: "Deployment",
      description:
        "Deploys static builds and React applications directly to Cloudflare Pages edge.",
      triggers: ["deploy to cloudflare", "shareable link"],
    },
    {
      name: "setup-agent-env",
      category: "Configuration",
      description:
        "Synchronizes production API keys and secrets directly from Coolify into runtime configs.",
      triggers: ["setup environment", "bootstrap agent"],
    },
  ];

  const filteredSkills = useMemo(() => {
    if (!skillSearchQuery.trim()) return builtinSkills;
    const q = skillSearchQuery.toLowerCase();
    return builtinSkills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.triggers.some((t) => t.toLowerCase().includes(q)),
    );
  }, [skillSearchQuery]);

  if (isLoading) {
    return (
      <div
        data-testid="agent-context-loading"
        className="flex h-full items-center justify-center p-12"
      >
        <div className="size-8 rounded-full border-2 border-transparent border-t-white animate-spin" />
      </div>
    );
  }

  return (
    <div
      data-testid="agent-context-settings-screen"
      className="flex w-full flex-col gap-6"
    >
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--oh-border)]">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <Brain className="size-5" />
          </div>
          <div>
            <h2 className="text-xl font-medium leading-6 text-foreground">
              Agent Context & Memory Inspector
            </h2>
            <p className="text-xs text-[var(--oh-muted)]">
              Inspect active prompt instructions, loaded skills, runtime
              context, and persistent memory
            </p>
          </div>
        </div>

        {/* Status Pill */}
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 py-1.5 text-xs text-[var(--oh-text-secondary)]">
            <span
              className={cn(
                "size-2 rounded-full",
                isLoadMemoryEnabled ? "bg-emerald-400" : "bg-zinc-500",
              )}
            />
            <span>
              Memory: {isLoadMemoryEnabled ? "Active" : "Disabled"}
            </span>
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-[var(--oh-border)] pb-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab("memory")}
          className={cn(
            "inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer",
            activeTab === "memory"
              ? "bg-[var(--oh-surface-raised)] text-foreground border border-[var(--oh-border)] shadow-xs"
              : "text-[var(--oh-muted)] hover:text-foreground",
          )}
        >
          <Database className="size-3.5" />
          <span>Persistent Memory</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("prompt")}
          className={cn(
            "inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer",
            activeTab === "prompt"
              ? "bg-[var(--oh-surface-raised)] text-foreground border border-[var(--oh-border)] shadow-xs"
              : "text-[var(--oh-muted)] hover:text-foreground",
          )}
        >
          <FileText className="size-3.5" />
          <span>Active System Prompt</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("skills")}
          className={cn(
            "inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer",
            activeTab === "skills"
              ? "bg-[var(--oh-surface-raised)] text-foreground border border-[var(--oh-border)] shadow-xs"
              : "text-[var(--oh-muted)] hover:text-foreground",
          )}
        >
          <Sparkles className="size-3.5" />
          <span>Loaded Skills ({builtinSkills.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("env")}
          className={cn(
            "inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer",
            activeTab === "env"
              ? "bg-[var(--oh-surface-raised)] text-foreground border border-[var(--oh-border)] shadow-xs"
              : "text-[var(--oh-muted)] hover:text-foreground",
          )}
        >
          <Terminal className="size-3.5" />
          <span>Runtime Environment</span>
        </button>
      </div>

      {/* Tab 1: Persistent Memory */}
      {activeTab === "memory" && (
        <div className="space-y-6">
          {/* Toggle Card */}
          <div className="rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface)] p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  Workspace Memory & Microagents Loading
                </h3>
                <p className="text-xs text-[var(--oh-muted)] mt-1 max-w-xl">
                  When enabled, Starship scans the project workspace for{" "}
                  <code className="text-sky-400 font-mono">
                    .openhands/microagents/
                  </code>{" "}
                  and knowledge files, injecting persistent repository memories
                  into the agent's context window.
                </p>
              </div>

              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={isLoadMemoryEnabled}
                  onChange={(e) => handleToggleMemory(e.target.checked)}
                  disabled={isSaving}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
              </label>
            </div>
          </div>

          {/* Microagents & Memory Files Explorer */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">
                Repository Microagents & Memory Files
              </h3>
              <span className="text-xs text-[var(--oh-muted)]">
                Stored in <code className="font-mono">.openhands/microagents/</code>
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sampleMemoryItems.map((item) => (
                <div
                  key={item.path}
                  className="rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface)] p-4 space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-semibold text-sky-400">
                        {item.name}
                      </span>
                      <span className="rounded bg-white/5 px-2 py-0.5 text-[10px] text-[var(--oh-muted)]">
                        {item.type}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--oh-muted)]">
                      {item.description}
                    </p>
                  </div>

                  <div className="relative rounded-lg bg-[var(--oh-bg-workspace)] p-3 border border-[var(--oh-border)]">
                    <pre className="font-mono text-[11px] text-[var(--oh-text-secondary)] whitespace-pre-wrap overflow-hidden max-h-24">
                      {item.content}
                    </pre>
                    <button
                      type="button"
                      onClick={() => handleCopy(item.content, item.path)}
                      className="absolute top-2 right-2 p-1.5 rounded bg-white/10 text-[var(--oh-muted)] hover:text-white transition-colors cursor-pointer"
                      title="Copy content"
                    >
                      {copiedKey === item.path ? (
                        <Check className="size-3 text-emerald-400" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Active System Prompt */}
      {activeTab === "prompt" && (
        <div className="space-y-6">
          {/* Active Profile Info */}
          <div className="rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface)] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-xs text-[var(--oh-muted)]">
                Active Agent Profile
              </span>
              <h4 className="text-sm font-bold text-foreground">
                {activeProfile?.name || "Starship Default Agent"}
              </h4>
            </div>
            <div className="flex items-center gap-3 font-mono text-xs">
              <span className="rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 px-2.5 py-1">
                Kind: {activeProfile?.agent_kind || "OpenHands"}
              </span>
              <span className="rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2.5 py-1">
                Model:{" "}
                {(activeProfile as any)?.llm_model ||
                  (settings?.agent_settings as any)?.llm?.model ||
                  "Default"}
              </span>
            </div>
          </div>

          {/* System Instructions Viewer */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground">
                Base System Instructions
              </label>
              <button
                type="button"
                onClick={() => handleCopy(systemInstructions, "system-prompt")}
                className="inline-flex items-center gap-1 text-xs text-sky-400 hover:underline cursor-pointer"
              >
                {copiedKey === "system-prompt" ? (
                  <Check className="size-3.5 text-emerald-400" />
                ) : (
                  <Copy className="size-3.5" />
                )}
                <span>Copy Instructions</span>
              </button>
            </div>
            <div className="rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface)] p-4 font-mono text-xs text-[var(--oh-text-secondary)] whitespace-pre-wrap max-h-60 overflow-y-auto custom-scrollbar">
              {systemInstructions}
            </div>
          </div>

          {/* Custom Context Suffix Editor */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground">
                Custom System Context Suffix
              </label>
              <span className="text-[11px] text-[var(--oh-muted)]">
                Appended to all conversation prompts
              </span>
            </div>
            <textarea
              rows={4}
              value={customSuffix}
              onChange={(e) => setCustomSuffix(e.target.value)}
              placeholder="e.g. Always write unit tests with Vitest before finishing tasks. Follow conventional commits."
              className="w-full rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface)] p-3 font-mono text-xs text-foreground placeholder:text-[var(--oh-muted)]/50 focus:border-purple-500 focus:outline-none"
            />
            <div className="flex justify-end">
              <BrandButton
                type="button"
                variant="primary"
                onClick={handleSaveSuffix}
                isDisabled={isSaving}
              >
                {isSaving ? "Saving..." : "Save Context Suffix"}
              </BrandButton>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Loaded Skills */}
      {activeTab === "skills" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[var(--oh-muted)]" />
              <input
                type="text"
                placeholder="Search skills & triggers..."
                value={skillSearchQuery}
                onChange={(e) => setSkillSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] pl-9 pr-3 py-1.5 text-xs text-foreground placeholder:text-[var(--oh-muted)] focus:border-purple-500 focus:outline-none"
              />
            </div>
            <span className="text-xs text-[var(--oh-muted)]">
              {filteredSkills.length} active skills loaded
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredSkills.map((skill) => (
              <div
                key={skill.name}
                className="rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface)] p-4 space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-foreground">
                    {skill.name}
                  </span>
                  <span className="rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 text-[10px]">
                    {skill.category}
                  </span>
                </div>
                <p className="text-xs text-[var(--oh-muted)] leading-relaxed">
                  {skill.description}
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {skill.triggers.map((trig) => (
                    <span
                      key={trig}
                      className="rounded bg-white/5 px-2 py-0.5 font-mono text-[10px] text-zinc-400"
                    >
                      {trig}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 4: Runtime Environment */}
      {activeTab === "env" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface)] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="size-4 text-sky-400" />
                <h4 className="text-sm font-semibold text-foreground">
                  Injected Runtime Services Block
                </h4>
              </div>
              <button
                type="button"
                onClick={() =>
                  handleCopy(runtimeServicesPreview, "runtime-services")
                }
                className="inline-flex items-center gap-1 text-xs text-sky-400 hover:underline cursor-pointer"
              >
                {copiedKey === "runtime-services" ? (
                  <Check className="size-3.5 text-emerald-400" />
                ) : (
                  <Copy className="size-3.5" />
                )}
                <span>Copy</span>
              </button>
            </div>
            <pre className="rounded-lg bg-[var(--oh-bg-workspace)] p-3 font-mono text-xs text-emerald-400 border border-[var(--oh-border)] overflow-x-auto">
              {runtimeServicesPreview}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

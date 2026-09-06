import { useState } from "react";
import StickerFolderIcon from "#/icons/sticker-folder.svg?react";

import {
  useWorkspaceRootPresets,
  type WorkspaceRootPreset,
} from "#/hooks/use-standalone-workspace-runtime";
import { useWorkspaceRootStore } from "#/stores/workspace-root-store";
import { cn } from "#/utils/utils";

export function WorkspaceRootPicker() {
  const storedRoot = useWorkspaceRootStore((s) => s.root);
  const setRoot = useWorkspaceRootStore((s) => s.setRoot);
  const { presets, defaultRoot, isLoading } = useWorkspaceRootPresets();
  const [customPath, setCustomPath] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const activeRoot = storedRoot ?? defaultRoot ?? "";

  const handleSelectPreset = (preset: WorkspaceRootPreset) => {
    setRoot(preset.path);
    setIsOpen(false);
  };

  const handleApplyCustom = () => {
    const trimmed = customPath.trim();
    if (!trimmed) return;
    setRoot(trimmed);
    setCustomPath("");
    setIsOpen(false);
  };

  return (
    <div className="relative flex min-w-0 items-center gap-2">
      <button
        type="button"
        data-testid="workspace-root-picker-toggle"
        onClick={() => setIsOpen((open) => !open)}
        className={cn(
          "flex min-w-0 max-w-[min(420px,50vw)] items-center gap-1.5 rounded-md border border-[var(--oh-border)]",
          "bg-[var(--oh-surface-subtle)] px-2 py-1 text-xs text-[var(--oh-foreground)]",
          "hover:bg-[var(--oh-surface-hover)] transition-colors",
        )}
        title={activeRoot || "Select workspace root"}
      >
        <StickerFolderIcon className="h-3.5 w-3.5 shrink-0 overflow-visible" />
        <span className="truncate font-mono">
          {isLoading ? "Loading roots…" : activeRoot || "Select root"}
        </span>
      </button>

      {isOpen ? (
        <div
          data-testid="workspace-root-picker-menu"
          className="absolute left-0 top-full z-50 mt-1 w-[min(420px,calc(100vw-2rem))] rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] p-2 shadow-xl"
        >
          <div className="mb-2 px-1 text-[10px] uppercase tracking-wide text-[var(--oh-muted)]">
            Workspace root
          </div>
          <div className="flex flex-col gap-0.5">
            {presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                data-testid={`workspace-root-preset-${preset.id}`}
                onClick={() => handleSelectPreset(preset)}
                className={cn(
                  "flex flex-col items-start rounded-md px-2 py-1.5 text-left text-xs hover:bg-[var(--oh-surface-hover)]",
                  activeRoot === preset.path &&
                    "bg-[var(--oh-surface-subtle)] ring-1 ring-[var(--oh-accent)]/40",
                )}
              >
                <span className="font-medium text-[var(--oh-foreground)]">
                  {preset.label}
                </span>
                <span className="truncate font-mono text-[10px] text-[var(--oh-muted)]">
                  {preset.path}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-1 border-t border-[var(--oh-border)] pt-2">
            <input
              type="text"
              value={customPath}
              onChange={(e) => setCustomPath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleApplyCustom();
              }}
              placeholder="/absolute/path"
              data-testid="workspace-root-custom-input"
              className="min-w-0 flex-1 rounded-md border border-[var(--oh-border)] bg-[var(--oh-bg-workspace)] px-2 py-1 text-xs font-mono text-[var(--oh-foreground)] outline-none focus:border-[var(--oh-accent)]"
            />
            <button
              type="button"
              data-testid="workspace-root-custom-apply"
              onClick={handleApplyCustom}
              className="rounded-md bg-[var(--oh-accent)] px-2 py-1 text-xs font-medium text-white hover:opacity-90"
            >
              Apply
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

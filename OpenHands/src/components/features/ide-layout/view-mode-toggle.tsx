import { Monitor, MessageSquare } from "lucide-react";
import { cn } from "#/utils/utils";
import {
  useIdeViewStore,
  type ConversationViewMode,
} from "#/stores/ide-view-store";

/**
 * Toggle button to switch between Agent mode (chat-first) and IDE mode
 * (docked panels with editor, terminal, and chat side-by-side).
 *
 * Inspired by Cursor's agent ↔ IDE mode toggle. Sits in the conversation
 * header next to the conversation name.
 */
export function ViewModeToggle() {
  const viewMode = useIdeViewStore((s) => s.viewMode);
  const setViewMode = useIdeViewStore((s) => s.setViewMode);

  const modes: { value: ConversationViewMode; icon: typeof Monitor; label: string }[] = [
    { value: "agent", icon: MessageSquare, label: "Agent" },
    { value: "ide", icon: Monitor, label: "IDE" },
  ];

  return (
    <div
      className="flex items-center gap-0.5 rounded-lg bg-[var(--oh-surface)] border border-[var(--oh-border)] p-0.5"
      role="tablist"
      aria-label="View mode"
    >
      {modes.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={viewMode === value}
          onClick={() => setViewMode(value)}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all duration-150",
            viewMode === value
              ? "bg-[var(--oh-interactive-hover)] text-white shadow-sm"
              : "text-[var(--oh-muted)] hover:text-white hover:bg-[var(--oh-interactive-hover)]/50",
          )}
        >
          <Icon size={13} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

/* eslint-disable i18next/no-literal-string */
import {
  GitCompareArrows,
  MessageSquare,
  PanelBottom,
  PanelLeft,
  Search,
} from "lucide-react";
import { cn } from "#/utils/utils";
import {
  useBreakpoint,
  SIDEBAR_RAIL_COLLAPSE_MAX_WIDTH,
} from "#/hooks/use-breakpoint";
import { SidebarMobileMenuToggle } from "#/components/features/sidebar/sidebar-mobile-menu-toggle";
import { ConversationNameWithStatus } from "#/components/features/conversation/conversation-name-with-status";
import { useWorkbenchStore } from "#/stores/workbench-store";
import { ViewModeToggle } from "./view-mode-toggle";
import {
  toggleWorkbenchPanel,
  type WorkbenchPanelId,
} from "./workbench/panels";
import {
  formatKeybinding,
  isMacPlatform,
  type Keybinding,
} from "./workbench/keybindings";
import { KEYBINDINGS } from "./workbench/commands";
import { useReviewChanges } from "./review/use-review";

const PANEL_TOGGLES: {
  id: WorkbenchPanelId;
  label: string;
  icon: typeof PanelLeft;
  keybinding: Keybinding;
}[] = [
  {
    id: "explorer",
    label: "Explorer",
    icon: PanelLeft,
    keybinding: KEYBINDINGS.toggleExplorer,
  },
  {
    id: "search",
    label: "Search",
    icon: Search,
    keybinding: KEYBINDINGS.findInFiles,
  },
  {
    id: "review",
    label: "Review",
    icon: GitCompareArrows,
    keybinding: KEYBINDINGS.review,
  },
  {
    id: "terminal",
    label: "Terminal",
    icon: PanelBottom,
    keybinding: KEYBINDINGS.toggleTerminal,
  },
  {
    id: "chat",
    label: "Chat",
    icon: MessageSquare,
    keybinding: KEYBINDINGS.toggleChat,
  },
];

export function IdeHeader() {
  const isSidebarRailHidden = useBreakpoint(SIDEBAR_RAIL_COLLAPSE_MAX_WIDTH);
  const openPanels = useWorkbenchStore((s) => s.openPanels);
  const reviewChanges = useReviewChanges();
  const unreviewedCount = reviewChanges.data?.isRepository
    ? reviewChanges.data.changes.length
    : 0;
  const isMac = isMacPlatform();

  return (
    <div
      data-testid="ide-header"
      className={cn(
        "flex h-10 min-h-10 shrink-0 items-center gap-2 border-b border-[var(--oh-border)] bg-[#0d0d0d] px-2",
        isSidebarRailHidden && "pl-2.5",
      )}
    >
      {isSidebarRailHidden ? <SidebarMobileMenuToggle /> : null}
      <div className="min-w-0 flex-1">
        <ConversationNameWithStatus showRightPanelToggle={false} />
      </div>
      <div className="flex items-center gap-0.5" aria-label="Panels">
        {PANEL_TOGGLES.map(({ id, label, icon: Icon, keybinding }) => {
          const isOpen = openPanels.includes(id);
          return (
            <button
              key={id}
              type="button"
              aria-pressed={isOpen}
              aria-label={`Toggle ${label}`}
              title={`Toggle ${label} (${formatKeybinding(keybinding, isMac)})`}
              data-testid={`ide-toggle-${id}`}
              onClick={() => {
                const { api } = useWorkbenchStore.getState();
                if (api) toggleWorkbenchPanel(api, id);
              }}
              className={cn(
                "relative flex h-7 w-7 items-center justify-center rounded-md transition-colors",
                isOpen
                  ? "text-white"
                  : "text-[var(--oh-muted)] hover:text-white",
                "hover:bg-[var(--oh-interactive-hover)]",
              )}
            >
              <Icon size={15} />
              {id === "review" && unreviewedCount > 0 && (
                <span
                  data-testid="ide-review-count"
                  className="absolute -right-0.5 -top-0.5 min-w-3.5 rounded-full bg-[#528bff] px-1 text-center text-[9px] font-semibold leading-3.5 text-white"
                >
                  {unreviewedCount > 99 ? "99+" : unreviewedCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <ViewModeToggle />
    </div>
  );
}

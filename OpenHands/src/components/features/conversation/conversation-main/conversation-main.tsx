import { cn } from "#/utils/utils";
import "#/styles/agent-phase-glow.css";
import { useAgentPhaseStore } from "#/stores/agent-phase-store";
import { ChatInterfaceWrapper } from "./chat-interface-wrapper";
import { ConversationTabContent } from "../conversation-tabs/conversation-tab-content/conversation-tab-content";
import { ConversationNameWithStatus } from "../conversation-name-with-status";
import { ConversationTabs } from "../conversation-tabs/conversation-tabs";
import { ResizeHandle } from "../../../ui/resize-handle";
import { useResizablePanels } from "#/hooks/use-resizable-panels";
import { useConversationStore } from "#/stores/conversation-store";
import {
  useBreakpoint,
  SIDEBAR_RAIL_COLLAPSE_MAX_WIDTH,
} from "#/hooks/use-breakpoint";
import { SidebarMobileMenuToggle } from "#/components/features/sidebar/sidebar-mobile-menu-toggle";
import { useIdeViewStore } from "#/stores/ide-view-store";
import { useIdeViewShortcut } from "#/hooks/use-ide-view-shortcut";
import { ViewModeToggle } from "#/components/features/ide-layout/view-mode-toggle";
import { IdeLayout } from "#/components/features/ide-layout/ide-layout";

function getDesktopTabPanelClass(isRightPanelShown: boolean) {
  return isRightPanelShown
    ? "translate-x-0 opacity-100"
    : "w-0 translate-x-full opacity-0";
}

export function ConversationMain() {
  const isMobile = useBreakpoint();
  const isSidebarRailHidden = useBreakpoint(SIDEBAR_RAIL_COLLAPSE_MAX_WIDTH);
  const { isRightPanelShown } = useConversationStore();
  const agentPhaseClass = useAgentPhaseStore((s) => s.phaseClass);
  const viewMode = useIdeViewStore((s) => s.viewMode);

  // Register Cmd+Shift+I keyboard shortcut for toggling IDE mode
  useIdeViewShortcut();

  const { leftWidth, rightWidth, isDragging, containerRef, handleMouseDown } =
    useResizablePanels({
      defaultLeftWidth: 50,
      minLeftWidth: 30,
      maxLeftWidth: 80,
      storageKey: "desktop-layout-panel-width",
    });

  // IDE mode: render the dockview layout (desktop only, falls back to agent on mobile)
  if (viewMode === "ide" && !isMobile) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        {/* Thin header bar with conversation name and mode toggle */}
        <div
          data-testid="ide-header"
          className={cn(
            "flex h-10 min-h-10 shrink-0 items-center px-2 border-b border-[var(--oh-border)] bg-[#0d0d0d]",
            isSidebarRailHidden && "gap-2 pl-2.5",
          )}
        >
          {isSidebarRailHidden ? <SidebarMobileMenuToggle /> : null}
          <div className="min-w-0 flex-1">
            <ConversationNameWithStatus />
          </div>
          <ViewModeToggle />
        </div>
        {/* Dockview IDE layout fills the rest */}
        <div className="flex-1 min-h-0">
          <IdeLayout />
        </div>
      </div>
    );
  }

  // Agent mode: original chat-first layout
  return (
    <div
      className={cn(
        isMobile
          ? "relative min-h-0 flex-1 flex flex-col"
          : "h-full flex flex-col overflow-hidden",
      )}
    >
      <div
        ref={containerRef}
        className={cn(
          "flex flex-1 overflow-hidden",
          isMobile ? "flex-col" : "transition-all duration-300 ease-in-out",
        )}
        // transition toggled at runtime based on drag state
        style={
          !isMobile
            ? { transitionProperty: isDragging ? "none" : "all" }
            : undefined
        }
      >
        {/* Chat Panel - always mounted, styled differently for mobile/desktop.
            Owns its own header (name + status) and gets bottom padding so the
            chat input doesn't slam the floor. */}
        <div
          className={cn(
            "flex flex-col bg-base overflow-hidden",
            agentPhaseClass,
            isMobile ? "flex-1" : "transition-all duration-300 ease-in-out",
          )}
          // panel width computed at runtime by resize hook; transition toggled by drag state
          style={
            !isMobile
              ? {
                  width: isRightPanelShown ? `${leftWidth}%` : "100%",
                  transitionProperty: isDragging ? "none" : "all",
                }
              : undefined
          }
        >
          <div
            data-testid="chat-pane-header"
            className={cn(
              "flex h-10 min-h-10 shrink-0 items-center",
              isSidebarRailHidden && "gap-2 pl-2.5",
            )}
          >
            {isSidebarRailHidden ? <SidebarMobileMenuToggle /> : null}
            <div className="min-w-0 flex-1">
              <ConversationNameWithStatus />
            </div>
            {/* View mode toggle in the agent header (desktop only) */}
            {!isMobile && (
              <div className="mr-2">
                <ViewModeToggle />
              </div>
            )}
          </div>
          <div className="flex-1 min-h-0 flex flex-col">
            <ChatInterfaceWrapper
              isRightPanelShown={!isMobile && isRightPanelShown}
            />
          </div>
        </div>

        {/* Resize Handle - only shown on desktop when right panel is visible */}
        {!isMobile && isRightPanelShown && (
          <ResizeHandle onMouseDown={handleMouseDown} isDragging={isDragging} />
        )}

        {/* Right panel: desktop side drawer. Mobile opens Files/Tools via /panel route. */}
        {!isMobile && (
          <div
            className={cn(
              "transition-all duration-300 ease-in-out overflow-hidden",
              getDesktopTabPanelClass(isRightPanelShown),
            )}
            style={{
              width: isRightPanelShown ? `${rightWidth}%` : "0%",
              transitionProperty: isDragging ? "opacity, transform" : "all",
            }}
          >
            <div className="flex h-full w-full flex-col">
              <div className="flex flex-col flex-1 min-h-0 bg-[var(--oh-surface)] border-l border-[var(--oh-border)] overflow-hidden">
                <div
                  data-testid="tabs-pane-header"
                  className="flex shrink-0 flex-col border-b border-[var(--oh-border)]"
                >
                  <ConversationTabs isPanelResizing={isDragging} />
                </div>
                <div className="flex-1 min-h-0 flex flex-col">
                  <ConversationTabContent />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

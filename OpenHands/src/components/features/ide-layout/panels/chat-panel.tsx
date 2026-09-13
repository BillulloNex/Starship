import { ChatInterface } from "#/components/features/chat/chat-interface";

/**
 * Chat panel for the IDE view — wraps the existing ChatInterface component
 * inside a dockview panel. Unlike the agent-mode layout which centers the chat
 * with a max-width, the IDE chat panel fills its entire available width since
 * it's already constrained by the dockview pane size.
 */
export function ChatPanel() {
  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-base">
      <div className="w-full h-full flex flex-col min-h-0">
        <ChatInterface />
      </div>
    </div>
  );
}

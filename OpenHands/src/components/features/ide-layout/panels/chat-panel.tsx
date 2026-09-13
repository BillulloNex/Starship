import React, { useState, useMemo } from "react";
import {
  ChevronDown,
  Plus,
  Search,
  MessageSquare,
  Loader2,
  Bot,
} from "lucide-react";
import { useNavigate } from "react-router";
import { ChatInterface } from "#/components/features/chat/chat-interface";
import { useConversationId } from "#/hooks/use-conversation-id";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { usePaginatedConversations } from "#/hooks/query/use-paginated-conversations";
import { useNewConversationCommand } from "#/hooks/mutation/use-new-conversation-command";
import { useClickOutsideElement } from "#/hooks/use-click-outside-element";
import { useIdeViewStore } from "#/stores/ide-view-store";
import { formatTimeDelta } from "#/utils/format-time-delta";
import { cn } from "#/utils/utils";

/**
 * Chat panel for the IDE view — wraps ChatInterface with an independent
 * header supporting fast conversation switching and new chat creation,
 * matching the standalone IDE model of Cursor and Antigravity.
 */
export function ChatPanel() {
  const { conversationId } = useConversationId();
  const { data: activeConversation } = useActiveConversation();
  const { data: paginatedData } = usePaginatedConversations(30);
  const newConversationMutation = useNewConversationCommand();
  const setViewMode = useIdeViewStore((s) => s.setViewMode);
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const popoverRef = useClickOutsideElement<HTMLDivElement>(() =>
    setIsOpen(false),
  );

  const conversations = useMemo(() => {
    if (!paginatedData?.pages) return [];
    const all = paginatedData.pages.flatMap((page) => page.items ?? []);
    if (!searchQuery.trim()) return all;
    const query = searchQuery.toLowerCase();
    return all.filter((c) => (c.title || "").toLowerCase().includes(query));
  }, [paginatedData, searchQuery]);

  const handleNewChat = () => {
    if (newConversationMutation.isPending) return;
    if (activeConversation?.id) {
      newConversationMutation.mutate();
    } else {
      navigate("/conversations");
    }
  };

  const handleSelectConversation = (id: string) => {
    setIsOpen(false);
    if (id !== conversationId) {
      navigate(`/conversations/${id}`);
    }
  };

  const handleOpenInAgentMode = () => {
    setIsOpen(false);
    setViewMode("agent");
  };

  return (
    <div className="relative h-full w-full flex flex-col overflow-hidden bg-base">
      {/* IDE Chat Header */}
      <div className="relative flex h-9 min-h-9 w-full items-center justify-between border-b border-[var(--oh-border)] bg-[var(--oh-surface)] px-2">
        {/* Left: Chat Switcher dropdown button */}
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="group flex min-w-0 items-center gap-1.5 rounded px-1.5 py-0.5 text-xs text-[var(--oh-muted)] hover:bg-[var(--oh-interactive-hover)] hover:text-white transition-colors"
          title="Switch conversation"
        >
          <MessageSquare size={13} className="shrink-0 text-[#a78bfa]" />
          <span className="truncate max-w-[170px] font-medium text-white">
            {activeConversation?.title || "Chat"}
          </span>
          <ChevronDown
            size={12}
            className={cn(
              "shrink-0 transition-transform duration-150 text-[var(--oh-muted)] group-hover:text-white",
              isOpen && "rotate-180",
            )}
          />
        </button>

        {/* Right: Actions */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleNewChat}
            disabled={newConversationMutation.isPending}
            className="flex h-6 w-6 items-center justify-center rounded text-[var(--oh-muted)] hover:bg-[var(--oh-interactive-hover)] hover:text-white transition-colors disabled:opacity-50"
            title="New Chat"
          >
            {newConversationMutation.isPending ? (
              <Loader2 size={13} className="animate-spin text-white" />
            ) : (
              <Plus size={14} />
            )}
          </button>
        </div>

        {/* Switcher Popover */}
        {isOpen && (
          <div
            ref={popoverRef}
            className="absolute left-2 right-2 top-9 z-50 flex max-h-80 flex-col rounded-lg border border-[var(--oh-border)] bg-[#141414] p-1.5 shadow-2xl backdrop-blur-md"
          >
            <div className="relative mb-1 flex items-center px-1">
              <Search
                size={12}
                className="pointer-events-none absolute left-2.5 text-[var(--oh-muted)]"
              />
              <input
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search conversations..."
                className="h-7 w-full rounded border border-[var(--oh-border)] bg-[var(--oh-surface)] pl-6 pr-2 text-xs text-white placeholder-[var(--oh-muted)] focus:border-[#a78bfa] focus:outline-none"
              />
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-[var(--oh-border)]/30">
              {conversations.length === 0 ? (
                <div className="py-4 text-center text-xs text-[var(--oh-muted)]">
                  No conversations found
                </div>
              ) : (
                conversations.map((c) => {
                  const isActive = c.id === conversationId;
                  const time = c.created_at || c.updated_at;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleSelectConversation(c.id)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-xs transition-colors rounded",
                        isActive
                          ? "bg-[var(--oh-interactive-hover)] text-white font-medium"
                          : "text-[var(--oh-muted)] hover:bg-[var(--oh-interactive-hover)]/60 hover:text-white",
                      )}
                    >
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <span
                          className={cn(
                            "h-1.5 w-1.5 shrink-0 rounded-full",
                            isActive ? "bg-emerald-400" : "bg-neutral-600",
                          )}
                        />
                        <span className="truncate">
                          {c.title || "Untitled Conversation"}
                        </span>
                      </div>
                      {time && (
                        <span className="shrink-0 text-[10px] text-neutral-500">
                          {formatTimeDelta(String(time))}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            <div className="mt-1 flex items-center justify-between border-t border-[var(--oh-border)] pt-1 text-[11px]">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  handleNewChat();
                }}
                className="flex items-center gap-1 rounded px-2 py-1 text-[#a78bfa] hover:bg-[var(--oh-interactive-hover)] transition-colors"
              >
                <Plus size={12} />
                <span>New Chat</span>
              </button>

              <button
                type="button"
                onClick={handleOpenInAgentMode}
                className="flex items-center gap-1 rounded px-2 py-1 text-[var(--oh-muted)] hover:text-white hover:bg-[var(--oh-interactive-hover)] transition-colors"
              >
                <Bot size={12} />
                <span>Agent Mode</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Chat Interface */}
      <div className="w-full h-full flex flex-col min-h-0">
        <ChatInterface />
      </div>
    </div>
  );
}

import React from "react";
import { ExtraProps } from "react-markdown";
import { useFilesTabStore } from "#/stores/files-tab-store";
import { useConversationStore } from "#/stores/conversation-store";
import { useOptionalConversationId } from "#/hooks/use-conversation-id";
import { toWorkspaceRelativePath } from "#/utils/workspace-relative-path";

function isWorkspacePath(href?: string): boolean {
  if (!href) return false;
  if (/^(https?:\/\/|mailto:|tel:|data:|javascript:)/i.test(href)) {
    return false;
  }
  if (
    href.startsWith("/home/openhands/") ||
    href.startsWith("/workspace/") ||
    href.startsWith("/tmp/") ||
    href.startsWith("./") ||
    /\.[a-zA-Z0-9]{1,10}(#|\?|$)/.test(href)
  ) {
    return true;
  }
  return false;
}

export function anchor({
  href,
  children,
  onClick,
  ...props
}: React.ClassAttributes<HTMLAnchorElement> &
  React.AnchorHTMLAttributes<HTMLAnchorElement> &
  ExtraProps) {
  const { conversationId } = useOptionalConversationId();
  const isWorkspace = isWorkspacePath(href);

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (onClick) onClick(e);
    if (isWorkspace && href) {
      e.preventDefault();
      const relativePath = toWorkspaceRelativePath(href);
      if (relativePath) {
        useFilesTabStore.getState().setSelectedPath(relativePath, conversationId);
        useConversationStore.getState().setSelectedTab("files");
        useConversationStore.getState().setIsRightPanelShown(true);
      }
    }
  };

  return (
    <a
      className="text-[var(--oh-color-primary)] hover:underline font-medium inline-flex items-center gap-0.5 transition-colors cursor-pointer"
      href={href}
      target={isWorkspace ? undefined : "_blank"}
      rel={isWorkspace ? undefined : "noopener noreferrer"}
      onClick={handleClick}
      {...props}
    >
      {children}
    </a>
  );
}

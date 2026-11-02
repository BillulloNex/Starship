import React from "react";
import type { Components } from "react-markdown";
import { useWorkspaceMarkdownComponents } from "./use-workspace-markdown-components";

const WorkspaceMarkdownComponentsContext = React.createContext<
  Partial<Components> | undefined
>(undefined);

/**
 * Mounts the workspace-aware markdown overrides once for a whole message
 * list, so every agent bubble resolves `![](workspace/relative.png)` against
 * the conversation's fileserver without each message subscribing to the
 * conversation and workspace-session queries on its own.
 *
 * Mount it where the active conversation is already observed (the chat
 * interface). Messages rendered outside it — the shared read-only view,
 * unit tests — get no overrides and render markdown as before.
 */
export function WorkspaceMarkdownComponentsProvider({
  children,
}: React.PropsWithChildren) {
  const components = useWorkspaceMarkdownComponents();
  return (
    <WorkspaceMarkdownComponentsContext.Provider value={components}>
      {children}
    </WorkspaceMarkdownComponentsContext.Provider>
  );
}

export const useWorkspaceMarkdownComponentsContext = ():
  | Partial<Components>
  | undefined => React.useContext(WorkspaceMarkdownComponentsContext);

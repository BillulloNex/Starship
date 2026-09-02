import type { ReactNode } from "react";

import { WorkspaceRuntimeProvider } from "#/context/workspace-runtime-context";
import { useStandaloneWorkspaceRuntime } from "#/hooks/use-standalone-workspace-runtime";
import { WorkspaceRootPicker } from "#/components/features/standalone-workspace/workspace-root-picker";

interface StandaloneWorkspaceShellProps {
  title: string;
  children: ReactNode;
  toolbar?: ReactNode;
}

export function StandaloneWorkspaceShell({
  title,
  children,
  toolbar,
}: StandaloneWorkspaceShellProps) {
  const runtime = useStandaloneWorkspaceRuntime();

  if (runtime.isLoadingRoot) {
    return (
      <main className="flex h-full w-full items-center justify-center bg-[var(--oh-surface)] text-sm text-[var(--oh-muted)]">
        Loading workspace…
      </main>
    );
  }

  if (runtime.error) {
    return (
      <main className="flex h-full w-full items-center justify-center bg-[var(--oh-surface)] px-6 text-sm text-red-400">
        Failed to resolve workspace root: {runtime.error.message}
      </main>
    );
  }

  return (
    <WorkspaceRuntimeProvider value={runtime}>
      <main
        className="flex h-full w-full flex-col bg-[var(--oh-surface)]"
        data-testid="standalone-workspace-shell"
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-[var(--oh-border)] px-3 py-2">
          <h1 className="text-sm font-semibold text-[var(--oh-foreground)]">
            {title}
          </h1>
          <WorkspaceRootPicker />
          {toolbar ? (
            <div className="ml-auto flex items-center gap-2">{toolbar}</div>
          ) : null}
        </div>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </main>
    </WorkspaceRuntimeProvider>
  );
}

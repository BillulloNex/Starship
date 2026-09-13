import { lazy, Suspense } from "react";
import { LoadingSpinner } from "#/components/shared/loading-spinner";

const Terminal = lazy(
  () => import("#/components/features/terminal/terminal"),
);

/**
 * Terminal panel for the IDE view — wraps the existing Xterm.js Terminal
 * component inside a dockview panel.
 */
export function TerminalPanel() {
  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-[#141414]">
      <Suspense
        fallback={
          <div className="flex-1 flex items-center justify-center">
            <LoadingSpinner size="small" />
          </div>
        }
      >
        <Terminal />
      </Suspense>
    </div>
  );
}

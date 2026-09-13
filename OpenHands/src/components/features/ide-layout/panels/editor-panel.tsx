import { lazy, Suspense } from "react";
import { LoadingSpinner } from "#/components/shared/loading-spinner";

const FilesTab = lazy(() => import("#/routes/files-tab"));

/**
 * Editor panel for the IDE view — wraps the existing FilesTab component
 * (which includes the file tree sidebar, Monaco editor, tab bar, breadcrumbs,
 * and status bar) inside a dockview panel.
 */
export function EditorPanel() {
  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-[#141414]">
      <Suspense
        fallback={
          <div className="flex-1 flex items-center justify-center">
            <LoadingSpinner size="small" />
          </div>
        }
      >
        <FilesTab />
      </Suspense>
    </div>
  );
}

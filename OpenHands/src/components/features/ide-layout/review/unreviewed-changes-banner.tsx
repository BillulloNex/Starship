/* eslint-disable i18next/no-literal-string */
import { GitCompareArrows } from "lucide-react";
import { useWorkbenchStore } from "#/stores/workbench-store";
import { useReviewActions } from "./use-review";

export function UnreviewedChangesBanner({ path }: { path: string }) {
  const actions = useReviewActions();

  return (
    <div
      data-testid="unreviewed-changes-banner"
      className="flex shrink-0 items-center gap-2 border-b border-[#528bff]/25 bg-[#528bff]/10 px-3 py-1 text-xs text-[#c9d8ff]"
    >
      <GitCompareArrows className="h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">
        This file has unreviewed changes.
      </span>
      <button
        type="button"
        onClick={() => useWorkbenchStore.getState().setReviewPath(path)}
        data-testid="unreviewed-review"
        className="rounded bg-[#528bff]/30 px-2 py-0.5 font-medium text-white hover:bg-[#528bff]/45"
      >
        Review
      </button>
      <button
        type="button"
        onClick={() => actions.acceptFile(path)}
        disabled={actions.isBusy}
        data-testid="unreviewed-accept"
        className="rounded px-2 py-0.5 text-[#c9d8ff] hover:bg-white/10 disabled:opacity-50"
      >
        Accept
      </button>
    </div>
  );
}

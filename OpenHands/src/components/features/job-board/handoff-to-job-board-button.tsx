/* eslint-disable i18next/no-literal-string */
import { Columns3 } from "lucide-react";
import { useNavigate } from "react-router";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useCreateJob } from "#/hooks/query/use-jobs";
import { useUnifiedLimits } from "#/hooks/query/use-unified-limits";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";

export function buildHandoffJob(conversation: {
  id?: string | null;
  title?: string | null;
  workspace?: { working_dir?: string | null } | null;
}) {
  const title = conversation.title?.trim() || "Continue this conversation";
  const workspace = conversation.workspace?.working_dir?.trim() || "/projects";
  const conversationId = conversation.id ?? null;
  const details = [
    "Handoff from a live Grokbot conversation.",
    conversationId ? `Conversation: ${conversationId}` : null,
    `Workspace: ${workspace}`,
    "",
    "Continue the unfinished work. Read the workspace, then finish or split remaining tasks onto the job board.",
  ]
    .filter(Boolean)
    .join("\n");
  return {
    title: `Continue: ${title}`,
    details,
    workspace,
    status: "ready" as const,
    conversationId,
    source: { kind: "human" as const, name: "handoff" },
  };
}

export function HandoffToJobBoardButton() {
  const navigate = useNavigate();
  const { data: conversation } = useActiveConversation();
  const createJob = useCreateJob();
  const { isAnyExhausted } = useUnifiedLimits();

  if (!conversation?.id) return null;

  const handleClick = async () => {
    try {
      await createJob.mutateAsync(buildHandoffJob(conversation));
      displaySuccessToast("Posted leftover work to the Job Board");
      navigate("/jobs");
    } catch (err) {
      displayErrorToast(
        err instanceof Error ? err.message : "Failed to post job",
      );
    }
  };

  return (
    <button
      type="button"
      data-testid="handoff-to-job-board"
      onClick={handleClick}
      disabled={createJob.isPending}
      title="Post leftover work to the Job Board so another agent can continue"
      className={
        isAnyExhausted
          ? "inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-200 hover:bg-amber-500/25 disabled:opacity-40"
          : "inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--oh-border)] px-2 py-0.5 text-[11px] text-[var(--oh-muted)] hover:bg-white/10 hover:text-white disabled:opacity-40"
      }
    >
      <Columns3 className="size-3" />
      {isAnyExhausted ? "Handoff — quota low" : "To Job Board"}
    </button>
  );
}

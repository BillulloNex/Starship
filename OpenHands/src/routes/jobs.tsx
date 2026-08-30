/* eslint-disable i18next/no-literal-string */
import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  Check,
  Columns3,
  Loader2,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import {
  type JobRecord,
  type JobStatus,
  useClaimJob,
  useCompleteJob,
  useCreateJob,
  useDeleteJob,
  useJobs,
  useReleaseJob,
  useReviewJob,
  useStartJob,
  useUpdateJobBoardSettings,
} from "#/hooks/query/use-jobs";
import { useCreateConversation } from "#/hooks/mutation/use-create-conversation";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";

const COLUMNS: Array<{
  status: JobStatus;
  label: string;
  hint: string;
}> = [
  { status: "backlog", label: "Backlog", hint: "Not ready yet" },
  { status: "ready", label: "Ready", hint: "Waiting for an agent" },
  { status: "in_progress", label: "In Progress", hint: "Claimed and running" },
  { status: "review", label: "Review", hint: "Needs a second look" },
  { status: "done", label: "Done", hint: "Accepted" },
  { status: "blocked", label: "Blocked", hint: "Stuck" },
];

function formatWhen(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildJobPrompt(job: JobRecord) {
  return [
    `You picked up Job Board item ${job.id}: ${job.title}`,
    "",
    job.details || "(no additional details)",
    "",
    job.workspace ? `Workspace: ${job.workspace}` : null,
    `Posted by: ${job.source.kind} / ${job.source.name}`,
    job.reviewRequired
      ? `This job requires review by ${job.reviewer || "another agent"} before it is done.`
      : "Mark the job done when the work is complete.",
    "",
    "When you finish, hand off, or get stuck, update the board:",
    `  grokbot-job complete ${job.id} --result "<what you did>"`,
    `  grokbot-job release ${job.id}`,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

function JobCard({
  job,
  busy,
  onStart,
  onClaim,
  onRelease,
  onComplete,
  onReview,
  onDelete,
  onOpen,
}: {
  job: JobRecord;
  busy: boolean;
  onStart: () => void;
  onClaim: () => void;
  onRelease: () => void;
  onComplete: () => void;
  onReview: (decision: "accept" | "reject") => void;
  onDelete: () => void;
  onOpen: () => void;
}) {
  return (
    <article
      data-testid={`job-card-${job.id}`}
      className="rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-raised)] p-3 space-y-2"
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="text-left text-sm font-semibold text-foreground hover:text-amber-300"
        >
          {job.title}
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          aria-label="Delete job"
          className="text-[var(--oh-muted)] hover:text-red-400 disabled:opacity-40"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
      {job.details ? (
        <p className="text-xs text-[var(--oh-muted)] line-clamp-3">
          {job.details}
        </p>
      ) : null}
      <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-[var(--oh-muted)]">
        <div>
          <dt className="uppercase tracking-wide">Source</dt>
          <dd className="text-foreground/80">
            {job.source.kind} · {job.source.name}
          </dd>
        </div>
        <div>
          <dt className="uppercase tracking-wide">Assignee</dt>
          <dd className="text-foreground/80">{job.assignee || "unassigned"}</dd>
        </div>
        <div>
          <dt className="uppercase tracking-wide">Workspace</dt>
          <dd className="truncate text-foreground/80">
            {job.workspace || "—"}
          </dd>
        </div>
        <div>
          <dt className="uppercase tracking-wide">Updated</dt>
          <dd className="text-foreground/80">{formatWhen(job.updatedAt)}</dd>
        </div>
        {job.reviewRequired ? (
          <div className="col-span-2">
            <dt className="uppercase tracking-wide">Reviewer</dt>
            <dd className="text-amber-300">
              {job.reviewer || "required"}
              {job.reviewedBy ? ` · reviewed by ${job.reviewedBy}` : ""}
            </dd>
          </div>
        ) : null}
        {job.completedBy ? (
          <div className="col-span-2">
            <dt className="uppercase tracking-wide">Completed by</dt>
            <dd className="text-foreground/80">{job.completedBy}</dd>
          </div>
        ) : null}
      </dl>
      <div className="flex flex-wrap gap-1.5 pt-1">
        {job.status === "ready" || job.status === "backlog" ? (
          <>
            <ActionButton disabled={busy} onClick={onStart} icon={<Play className="size-3" />}>
              Start
            </ActionButton>
            <ActionButton disabled={busy} onClick={onClaim}>
              Claim
            </ActionButton>
          </>
        ) : null}
        {job.status === "in_progress" ? (
          <>
            <ActionButton disabled={busy} onClick={onComplete} icon={<Check className="size-3" />}>
              Complete
            </ActionButton>
            <ActionButton disabled={busy} onClick={onRelease} icon={<Undo2 className="size-3" />}>
              Release
            </ActionButton>
            {job.conversationId ? (
              <ActionButton disabled={busy} onClick={onOpen}>
                Open chat
              </ActionButton>
            ) : null}
          </>
        ) : null}
        {job.status === "review" ? (
          <>
            <ActionButton
              disabled={busy}
              onClick={() => onReview("accept")}
              icon={<Check className="size-3" />}
            >
              Accept
            </ActionButton>
            <ActionButton
              disabled={busy}
              onClick={() => onReview("reject")}
              icon={<RotateCcw className="size-3" />}
            >
              Request changes
            </ActionButton>
          </>
        ) : null}
      </div>
    </article>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  icon,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-md border border-[var(--oh-border)] px-2 py-1 text-[11px] text-[var(--oh-text-secondary)] hover:bg-[var(--oh-interactive-hover)] disabled:opacity-40"
    >
      {icon}
      {children}
    </button>
  );
}

export default function JobsScreen() {
  const navigate = useNavigate();
  const { data, isLoading, refetch, isFetching } = useJobs();
  const createJob = useCreateJob();
  const claimJob = useClaimJob();
  const releaseJob = useReleaseJob();
  const completeJob = useCompleteJob();
  const reviewJob = useReviewJob();
  const startJob = useStartJob();
  const deleteJob = useDeleteJob();
  const updateSettings = useUpdateJobBoardSettings();
  const createConversation = useCreateConversation();

  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [workspace, setWorkspace] = useState("/projects");
  const [reviewer, setReviewer] = useState("");
  const [sourceName, setSourceName] = useState("human");
  const [ready, setReady] = useState(true);

  const jobs = data?.jobs ?? [];
  const settings = data?.settings;
  const busy =
    createJob.isPending ||
    claimJob.isPending ||
    releaseJob.isPending ||
    completeJob.isPending ||
    reviewJob.isPending ||
    startJob.isPending ||
    deleteJob.isPending ||
    createConversation.isPending;

  const grouped = useMemo(() => {
    const map = Object.fromEntries(
      COLUMNS.map((column) => [column.status, [] as JobRecord[]]),
    ) as Record<JobStatus, JobRecord[]>;
    for (const job of jobs) {
      map[job.status]?.push(job);
    }
    return map;
  }, [jobs]);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await createJob.mutateAsync({
        title,
        details,
        workspace,
        reviewer: reviewer || undefined,
        status: ready ? "ready" : "backlog",
        source: { kind: "human", name: sourceName || "human" },
      });
      displaySuccessToast("Job posted");
      setModalOpen(false);
      setTitle("");
      setDetails("");
      setReviewer("");
    } catch (err) {
      displayErrorToast(err instanceof Error ? err.message : "Failed to post job");
    }
  };

  const runAction = async (label: string, action: () => Promise<unknown>) => {
    try {
      await action();
      displaySuccessToast(label);
    } catch (err) {
      displayErrorToast(err instanceof Error ? err.message : label);
    }
  };

  const handleStart = async (job: JobRecord) => {
    try {
      const started = await startJob.mutateAsync({
        id: job.id,
        actor: { kind: "human", name: sourceName || "human" },
      });
      const conversationId = (started as JobRecord).conversationId;
      displaySuccessToast("Agent started");
      if (conversationId) {
        navigate(`/conversations/${conversationId}`);
      }
    } catch {
      createConversation.mutate(
        {
          query: buildJobPrompt(job),
          workingDir: job.workspace || undefined,
          entryPoint: "job_board",
        },
        {
          onSuccess: async (result) => {
            await claimJob.mutateAsync({
              id: job.id,
              actor: { kind: "human", name: sourceName || "human" },
            });
            displaySuccessToast("Agent started");
            navigate(`/conversations/${result.conversation_id}`);
          },
          onError: (err) => {
            displayErrorToast(
              err instanceof Error ? err.message : "Failed to start job",
            );
          },
        },
      );
    }
  };

  return (
    <main data-testid="jobs-screen" className="h-full flex-1 overflow-y-auto p-6 md:p-8">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <div className="flex flex-col gap-4 border-b border-[var(--oh-border)] pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-400">
              <Columns3 className="size-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Job Board</h1>
              <p className="text-xs text-[var(--oh-muted)]">
                Humans, agents, and automations post work. Agents claim it,
                hand it off when quota is low, and send it for review.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-2 rounded-md border border-[var(--oh-border)] px-2.5 py-1.5 text-xs text-[var(--oh-text-secondary)]">
              <input
                type="checkbox"
                checked={Boolean(settings?.autoDispatch)}
                onChange={(event) =>
                  updateSettings.mutate({ autoDispatch: event.target.checked })
                }
              />
              Auto-run ready jobs
            </label>
            <button
              type="button"
              onClick={() => refetch()}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--oh-border)] px-2.5 py-1.5 text-xs text-[var(--oh-text-secondary)] hover:bg-[var(--oh-interactive-hover)]"
            >
              {isFetching ? <Loader2 className="size-3 animate-spin" /> : null}
              Refresh
            </button>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-1 rounded-md bg-amber-500 px-2.5 py-1.5 text-xs font-medium text-black hover:bg-amber-400"
            >
              <Plus className="size-3.5" />
              New job
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-[var(--oh-muted)]">
            <Loader2 className="size-4 animate-spin" />
            Loading jobs…
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            {COLUMNS.map((column) => (
              <section
                key={column.status}
                data-testid={`job-column-${column.status}`}
                className="min-h-[240px] rounded-2xl border border-[var(--oh-border)] bg-black/20 p-3"
              >
                <header className="mb-3 flex items-baseline justify-between">
                  <h2 className="text-sm font-semibold text-foreground">
                    {column.label}
                  </h2>
                  <span className="text-[11px] text-[var(--oh-muted)]">
                    {grouped[column.status].length}
                  </span>
                </header>
                <p className="mb-3 text-[11px] text-[var(--oh-muted)]">
                  {column.hint}
                </p>
                <div className="space-y-2">
                  {grouped[column.status].map((job) => (
                    <JobCard
                      key={job.id}
                      job={job}
                      busy={busy}
                      onStart={() => handleStart(job)}
                      onClaim={() =>
                        runAction(
                          "Claimed",
                          () =>
                            claimJob.mutateAsync({
                              id: job.id,
                              actor: { kind: "human", name: sourceName || "human" },
                            }),
                        )
                      }
                      onRelease={() =>
                        runAction("Released", () => releaseJob.mutateAsync(job.id))
                      }
                      onComplete={() =>
                        runAction("Completed", () =>
                          completeJob.mutateAsync({
                            id: job.id,
                            actor: { kind: "human", name: sourceName || "human" },
                          }),
                        )
                      }
                      onReview={(decision) =>
                        runAction(
                          decision === "accept" ? "Accepted" : "Sent back",
                          () =>
                            reviewJob.mutateAsync({
                              id: job.id,
                              decision,
                              actor: { kind: "human", name: sourceName || "human" },
                            }),
                        )
                      }
                      onDelete={() =>
                        runAction("Deleted", () => deleteJob.mutateAsync(job.id))
                      }
                      onOpen={() => {
                        if (job.conversationId) {
                          navigate(`/conversations/${job.conversationId}`);
                        }
                      }}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={handleCreate}
            className="w-full max-w-lg space-y-4 rounded-2xl border border-[var(--oh-border)] bg-[var(--oh-surface-raised)] p-5"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Post a job</h2>
              <button type="button" onClick={() => setModalOpen(false)}>
                <X className="size-4 text-[var(--oh-muted)]" />
              </button>
            </div>
            <label className="block space-y-1 text-xs">
              <span>Title</span>
              <input
                required
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="w-full rounded-md border border-[var(--oh-border)] bg-black/20 px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-1 text-xs">
              <span>Details</span>
              <textarea
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                rows={5}
                className="w-full rounded-md border border-[var(--oh-border)] bg-black/20 px-3 py-2 text-sm"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1 text-xs">
                <span>Workspace</span>
                <input
                  value={workspace}
                  onChange={(event) => setWorkspace(event.target.value)}
                  className="w-full rounded-md border border-[var(--oh-border)] bg-black/20 px-3 py-2 text-sm"
                />
              </label>
              <label className="block space-y-1 text-xs">
                <span>Reviewer (optional)</span>
                <input
                  value={reviewer}
                  onChange={(event) => setReviewer(event.target.value)}
                  placeholder="e.g. Codex"
                  className="w-full rounded-md border border-[var(--oh-border)] bg-black/20 px-3 py-2 text-sm"
                />
              </label>
            </div>
            <label className="block space-y-1 text-xs">
              <span>Posted by</span>
              <input
                value={sourceName}
                onChange={(event) => setSourceName(event.target.value)}
                className="w-full rounded-md border border-[var(--oh-border)] bg-black/20 px-3 py-2 text-sm"
              />
            </label>
            <label className="inline-flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={ready}
                onChange={(event) => setReady(event.target.checked)}
              />
              Put in Ready so an agent can pick it up
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-md border border-[var(--oh-border)] px-3 py-1.5 text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createJob.isPending}
                className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-medium text-black disabled:opacity-50"
              >
                Post job
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}

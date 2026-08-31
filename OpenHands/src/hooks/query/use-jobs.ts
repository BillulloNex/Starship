import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAgentServerBaseUrl } from "#/api/agent-server-config";

export type JobStatus =
  | "backlog"
  | "ready"
  | "in_progress"
  | "review"
  | "done"
  | "blocked";

export type JobActorKind = "human" | "agent" | "automation";

export interface JobActor {
  kind: JobActorKind;
  name: string;
}

export interface JobRecord {
  id: string;
  title: string;
  details: string;
  status: JobStatus;
  source: JobActor;
  assignee: string | null;
  reviewer: string | null;
  reviewRequired: boolean;
  workspace: string | null;
  conversationId: string | null;
  result: string | null;
  createdAt: string;
  updatedAt: string;
  claimedAt: string | null;
  completedAt: string | null;
  reviewedAt: string | null;
  completedBy: string | null;
  reviewedBy: string | null;
}

export interface JobBoardSettings {
  autoDispatch: boolean;
  maxActive: number;
}

export interface JobsResponse {
  jobs: JobRecord[];
  settings: JobBoardSettings;
}

const JOBS_ENDPOINT = "/api/jobs";
const JOBS_QUERY_KEY = ["job-board"] as const;

function jobsUrl(path = "") {
  const baseUrl = getAgentServerBaseUrl() ?? "";
  return `${baseUrl}${JOBS_ENDPOINT}${path}`;
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      (payload as { error?: string }).error ||
        `Job board request failed (${response.status})`,
    );
  }
  return payload as T;
}

export async function fetchJobs(): Promise<JobsResponse> {
  const response = await fetch(jobsUrl(), {
    headers: { Accept: "application/json" },
  });
  return readJson<JobsResponse>(response);
}

export function useJobs(enabled = true) {
  return useQuery({
    queryKey: JOBS_QUERY_KEY,
    queryFn: fetchJobs,
    enabled,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
}

function useJobMutation<TVariables>(
  mutate: (variables: TVariables) => Promise<unknown>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: mutate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: JOBS_QUERY_KEY });
    },
  });
}

export function useCreateJob() {
  return useJobMutation(
    (payload: {
      title: string;
      details?: string;
      status?: JobStatus;
      workspace?: string;
      reviewer?: string;
      conversationId?: string | null;
      source?: JobActor;
    }) =>
      fetch(jobsUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then((res) => readJson(res)),
  );
}

export function useClaimJob() {
  return useJobMutation((payload: { id: string; actor?: JobActor }) =>
    fetch(jobsUrl(`/${payload.id}/claim`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actor: payload.actor }),
    }).then((res) => readJson(res)),
  );
}

export function useReleaseJob() {
  return useJobMutation((id: string) =>
    fetch(jobsUrl(`/${id}/release`), { method: "POST" }).then((res) =>
      readJson(res),
    ),
  );
}

export function useCompleteJob() {
  return useJobMutation(
    (payload: { id: string; result?: string; actor?: JobActor }) =>
      fetch(jobsUrl(`/${payload.id}/complete`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then((res) => readJson(res)),
  );
}

export function useReviewJob() {
  return useJobMutation(
    (payload: {
      id: string;
      decision: "accept" | "reject";
      notes?: string;
      actor?: JobActor;
    }) =>
      fetch(jobsUrl(`/${payload.id}/review`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then((res) => readJson(res)),
  );
}

export function useStartJob() {
  return useJobMutation((payload: { id: string; actor?: JobActor }) =>
    fetch(jobsUrl(`/${payload.id}/start`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actor: payload.actor }),
    }).then((res) => readJson(res)),
  );
}

export function useDeleteJob() {
  return useJobMutation((id: string) =>
    fetch(jobsUrl(`/${id}`), { method: "DELETE" }).then((res) => readJson(res)),
  );
}

export function useUpdateJobBoardSettings() {
  return useJobMutation((patch: Partial<JobBoardSettings>) =>
    fetch(jobsUrl("/settings"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).then((res) => readJson(res)),
  );
}

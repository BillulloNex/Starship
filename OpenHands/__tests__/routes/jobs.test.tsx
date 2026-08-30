import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import JobsScreen from "#/routes/jobs";

const mockJobs = {
  jobs: [
    {
      id: "job_ready",
      title: "Continue the factory",
      details: "Pick this up overnight",
      status: "ready",
      source: { kind: "human", name: "Thomas" },
      assignee: null,
      reviewer: "Codex",
      reviewRequired: true,
      workspace: "/projects/Grokbot",
      conversationId: null,
      result: null,
      createdAt: "2026-08-30T00:00:00.000Z",
      updatedAt: "2026-08-30T00:00:00.000Z",
      claimedAt: null,
      completedAt: null,
      reviewedAt: null,
      completedBy: null,
      reviewedBy: null,
    },
  ],
  settings: { autoDispatch: false, maxActive: 2 },
};

vi.mock("#/hooks/query/use-jobs", async () => {
  const actual = await vi.importActual("#/hooks/query/use-jobs");
  return {
    ...actual,
    useJobs: () => ({
      data: mockJobs,
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
    }),
    useCreateJob: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useClaimJob: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useReleaseJob: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useCompleteJob: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useReviewJob: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useStartJob: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useDeleteJob: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useUpdateJobBoardSettings: () => ({ mutate: vi.fn(), isPending: false }),
  };
});

vi.mock("#/hooks/mutation/use-create-conversation", () => ({
  useCreateConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return { ...actual, useNavigate: () => vi.fn() };
});

describe("JobsScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the kanban and a ready job card", () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <JobsScreen />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("jobs-screen")).toBeInTheDocument();
    expect(screen.getByTestId("job-column-ready")).toBeInTheDocument();
    expect(screen.getByText("Continue the factory")).toBeInTheDocument();
    expect(screen.getByText(/Thomas/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
  });
});

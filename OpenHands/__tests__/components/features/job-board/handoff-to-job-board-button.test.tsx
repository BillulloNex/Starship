import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildHandoffJob,
  HandoffToJobBoardButton,
} from "#/components/features/job-board/handoff-to-job-board-button";

const mutateAsync = vi.fn();
const navigate = vi.fn();

vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return { ...actual, useNavigate: () => navigate };
});

vi.mock("#/hooks/query/use-active-conversation", () => ({
  useActiveConversation: () => ({
    data: {
      id: "conv-1",
      title: "Fix the auth flow",
      workspace: { working_dir: "/projects/Grokbot" },
    },
  }),
}));

vi.mock("#/hooks/query/use-jobs", () => ({
  useCreateJob: () => ({ mutateAsync, isPending: false }),
}));

vi.mock("#/hooks/query/use-unified-limits", () => ({
  useUnifiedLimits: () => ({ isAnyExhausted: true }),
}));

vi.mock("#/utils/custom-toast-handlers", () => ({
  displaySuccessToast: vi.fn(),
  displayErrorToast: vi.fn(),
}));

describe("HandoffToJobBoardButton", () => {
  beforeEach(() => {
    mutateAsync.mockResolvedValue({});
    navigate.mockReset();
  });

  it("builds a ready handoff job from the conversation", () => {
    const job = buildHandoffJob({
      id: "conv-1",
      title: "Fix the auth flow",
      workspace: { working_dir: "/projects/Grokbot" },
    });
    expect(job.status).toBe("ready");
    expect(job.title).toContain("Fix the auth flow");
    expect(job.workspace).toBe("/projects/Grokbot");
    expect(job.conversationId).toBe("conv-1");
    expect(job.details).toContain("conv-1");
  });

  it("posts the job and opens the board when quota is low", async () => {
    render(<HandoffToJobBoardButton />);
    expect(screen.getByTestId("handoff-to-job-board")).toHaveTextContent(
      "Handoff — quota low",
    );
    fireEvent.click(screen.getByTestId("handoff-to-job-board"));
    await vi.waitFor(() => {
      expect(mutateAsync).toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledWith("/jobs");
    });
  });
});

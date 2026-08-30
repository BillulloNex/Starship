// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  addJob,
  claimJob,
  completeJob,
  createJobRecord,
  deleteJob,
  getJob,
  handleJobBoardRequest,
  listJobs,
  parseJobsPath,
  reviewJob,
  updateSettings,
} from "../../scripts/job-board.mjs";

describe("job-board.mjs", () => {
  let jobsPath: string;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), "grokbot-jobs-"));
    jobsPath = path.join(tempDir, "jobs.json");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates a job with required review when a reviewer is set", () => {
    const job = createJobRecord({
      title: "Finish auth",
      reviewer: "Codex",
      source: { kind: "agent", name: "Claude" },
    });
    expect(job.status).toBe("backlog");
    expect(job.reviewRequired).toBe(true);
    expect(job.reviewer).toBe("Codex");
    expect(job.source).toEqual({ kind: "agent", name: "Claude" });
  });

  it("moves a claimed job through complete-to-review-to-done", async () => {
    const created = await addJob(
      { title: "Ship job board", reviewer: "Codex", status: "ready" },
      jobsPath,
    );
    const claimed = await claimJob(
      created.id,
      { kind: "agent", name: "Claude" },
      jobsPath,
    );
    expect(claimed.status).toBe("in_progress");
    expect(claimed.assignee).toBe("Claude");

    const completed = await completeJob(
      created.id,
      { actor: { kind: "agent", name: "Claude" }, result: "PR opened" },
      jobsPath,
    );
    expect(completed.status).toBe("review");
    expect(completed.completedBy).toBe("Claude");

    const accepted = await reviewJob(
      created.id,
      { actor: { kind: "agent", name: "Codex" }, decision: "accept" },
      jobsPath,
    );
    expect(accepted.status).toBe("done");
    expect(accepted.reviewedBy).toBe("Codex");
  });

  it("sends a rejected review back to ready", async () => {
    const created = await addJob(
      { title: "Needs another pass", reviewer: "Codex", status: "ready" },
      jobsPath,
    );
    await claimJob(created.id, { kind: "agent", name: "Claude" }, jobsPath);
    await completeJob(created.id, { actor: { kind: "agent", name: "Claude" } }, jobsPath);
    const rejected = await reviewJob(
      created.id,
      {
        actor: { kind: "agent", name: "Codex" },
        decision: "reject",
        notes: "Add tests",
      },
      jobsPath,
    );
    expect(rejected.status).toBe("ready");
    expect(rejected.assignee).toBeNull();
    expect(rejected.result).toContain("Add tests");
  });

  it("serves list/create over HTTP", async () => {
    const created = await addJob({ title: "From store" }, jobsPath);
    const req = {
      method: "GET",
      url: "/api/jobs",
      on() {
        return req;
      },
    };
    const res = createMockRes();
    await handleJobBoardRequest(req as never, res as never, { jobsPath });
    expect(res.statusCode).toBe(200);
    expect(res.body.jobs.some((job: { id: string }) => job.id === created.id)).toBe(
      true,
    );
  });

  it("deletes jobs and parses action paths", async () => {
    const created = await addJob({ title: "Temp" }, jobsPath);
    await deleteJob(created.id, jobsPath);
    expect(await getJob(created.id, jobsPath)).toBeNull();
    expect(parseJobsPath("/api/jobs/job_1/claim")).toEqual({
      id: "job_1",
      action: "claim",
    });
  });

  it("persists auto-dispatch settings", async () => {
    const settings = await updateSettings({ autoDispatch: true, maxActive: 3 }, jobsPath);
    expect(settings).toMatchObject({ autoDispatch: true, maxActive: 3 });
    const jobs = await listJobs(jobsPath);
    expect(jobs).toEqual([]);
  });
});

function createMockRes() {
  return {
    statusCode: 0,
    body: {} as { jobs: Array<{ id: string }> },
    writeHead(status: number) {
      this.statusCode = status;
    },
    end(raw: string) {
      this.body = JSON.parse(raw);
    },
  };
}

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AgentServerRuntimeService from "#/api/runtime-service/agent-server-runtime-service";
import * as review from "#/api/runtime-service/workspace-review.service";

// Runs the generated commands against a real repository with a local shell.
function runLocally(command: string, cwd: string | undefined) {
  try {
    const stdout = execFileSync("bash", ["-c", command], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    }).toString();
    return { exit_code: 0, stdout, stderr: "" };
  } catch (error) {
    const failure = error as {
      status?: number;
      stdout?: Buffer;
      stderr?: Buffer;
    };
    return {
      exit_code: failure.status ?? 1,
      stdout: failure.stdout?.toString() ?? "",
      stderr: failure.stderr?.toString() ?? "",
    };
  }
}

describe("git-backed review", () => {
  let workspace: string;
  let target: {
    conversationUrl: null;
    sessionApiKey: null;
    workingDir: string;
  };

  beforeEach(() => {
    const repo = mkdtempSync(path.join(tmpdir(), "grokbot-review-"));
    const git = (args: string) =>
      execFileSync("bash", ["-c", `git ${args}`], { cwd: repo });
    git("init -q");
    workspace = path.join(repo, "app");
    mkdirSync(path.join(workspace, "src"), { recursive: true });
    writeFileSync(path.join(workspace, "src/main.ts"), "one\ntwo\nthree\n");
    writeFileSync(path.join(workspace, "gone.ts"), "bye\n");
    git("add -A");
    git("-c user.email=t@t -c user.name=t commit -qm base");

    target = {
      conversationUrl: null,
      sessionApiKey: null,
      workingDir: workspace,
    };
    vi.spyOn(AgentServerRuntimeService, "executeCommand").mockImplementation(
      async (_url, _key, command, cwd) => runLocally(command, cwd),
    );
  });

  it("reviews an agent's edits file by file and change by change", async () => {
    writeFileSync(
      path.join(workspace, "src/main.ts"),
      "ONE\ntwo\nthree\nfour\n",
    );
    writeFileSync(path.join(workspace, "new file.ts"), "fresh\n");
    execFileSync("rm", [path.join(workspace, "gone.ts")]);

    expect(await review.listReviewChanges(target)).toEqual({
      isRepository: true,
      changes: [
        { path: "gone.ts", kind: "deleted" },
        { path: "new file.ts", kind: "added" },
        { path: "src/main.ts", kind: "modified" },
      ],
    });
    expect(await review.readReviewedVersion(target, "src/main.ts")).toBe(
      "one\ntwo\nthree\n",
    );
    expect(await review.readReviewedVersion(target, "new file.ts")).toBeNull();

    // Accepting one change updates git's copy, not the working tree.
    await review.writeReviewedVersion(
      target,
      "src/main.ts",
      "ONE\ntwo\nthree\n",
    );
    expect(await review.readReviewedVersion(target, "src/main.ts")).toBe(
      "ONE\ntwo\nthree\n",
    );
    expect(readFileSync(path.join(workspace, "src/main.ts"), "utf8")).toBe(
      "ONE\ntwo\nthree\nfour\n",
    );

    await review.acceptFile(target, "src/main.ts");
    await review.rejectFile(target, "new file.ts");
    await review.rejectFile(target, "gone.ts");

    expect(existsSync(path.join(workspace, "new file.ts"))).toBe(false);
    expect(readFileSync(path.join(workspace, "gone.ts"), "utf8")).toBe("bye\n");
    expect((await review.listReviewChanges(target)).changes).toEqual([]);
  });

  it("accepts everything at once", async () => {
    writeFileSync(path.join(workspace, "x.ts"), "x\n");
    writeFileSync(path.join(workspace, "src/main.ts"), "changed\n");
    await review.acceptAll(target);
    expect((await review.listReviewChanges(target)).changes).toEqual([]);
  });

  it("reports a workspace that isn't a git repository", async () => {
    const plain = mkdtempSync(path.join(tmpdir(), "grokbot-plain-"));
    expect(
      await review.listReviewChanges({ ...target, workingDir: plain }),
    ).toEqual({ isRepository: false, changes: [] });
  });
});

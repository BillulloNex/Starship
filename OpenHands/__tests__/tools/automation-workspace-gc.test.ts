// @vitest-environment node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const openhandsRoot = path.resolve(here, "../..");
const starshipRoot = path.resolve(openhandsRoot, "..");
const toolsDir = path.join(openhandsRoot, "tools");

describe("automation workspace disk leak", () => {
  it("keeps the shared-venv helper, GC, and uv shim in the tools tree", () => {
    const files = [
      "ensure-shared-sdk-venv.sh",
      "run-automation-setup.sh",
      "uv-shim/uv",
      "automation_workspace_gc.py",
      "automation_setup_rewrite.py",
    ];
    for (const file of files) {
      expect(readFileSync(path.join(toolsDir, file), "utf8").length).toBeGreaterThan(
        20,
      );
    }
  });

  it("patches setup.sh bash chains and garbage-collects leftover run venvs", () => {
    execFileSync(
      "python3",
      [path.join(here, "automation_workspace_gc_test.py")],
      {
        cwd: toolsDir,
        env: {
          ...process.env,
          PYTHONPATH: toolsDir,
        },
        stdio: "inherit",
      },
    );
  });

  it("does not let new preset setup.sh invoke the run wrapper", () => {
    const patcher = readFileSync(
      path.join(starshipRoot, "patches/fix-automation-workspace-disk.py"),
      "utf8",
    );
    expect(patcher).toContain("ensure-shared-sdk-venv.sh");
    expect(patcher).not.toMatch(
      /NEW_SETUP_SH[\s\S]*run-automation-setup\.sh/,
    );
  });
});

describe("Grokbot production image automation disk guards", () => {
  const dockerfile = readFileSync(path.join(starshipRoot, "Dockerfile"), "utf8");
  const entrypoint = readFileSync(
    path.join(openhandsRoot, "docker/entrypoint.sh"),
    "utf8",
  );

  it("builds a shared SDK venv and patches preset setup.sh", () => {
    expect(dockerfile).toContain("/opt/openhands-shared-sdk-venv");
    expect(dockerfile).toContain("fix-automation-workspace-disk.py");
    expect(dockerfile).toContain("automation_workspace_gc.py");
  });

  it("reclaims leftover automation-runs on boot and on a loop", () => {
    expect(entrypoint).toContain("automation_workspace_gc.py --once");
    expect(entrypoint).toContain("automation_workspace_gc.py --loop");
    expect(entrypoint).toContain("AUTOMATION_SHARED_VENV");
  });
});

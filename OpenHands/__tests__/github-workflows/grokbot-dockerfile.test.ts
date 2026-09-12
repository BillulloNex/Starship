// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const dockerfile = readFileSync(path.join(projectRoot, "Dockerfile"), "utf-8");

describe("Grokbot production image", () => {
  it("includes the Node.js executables required by stdio MCP servers", () => {
    expect(dockerfile).toContain("COPY --from=frontend-build /usr/local /usr/local");
    expect(dockerfile).toContain("RUN node --version && npm --version && npx --version");
  });

  it("installs a shared automation SDK venv instead of per-run copies", () => {
    expect(dockerfile).toContain("/opt/openhands-shared-sdk-venv");
    expect(dockerfile).toContain("fix-automation-workspace-disk.py");
    expect(dockerfile).toContain("fix-automation-sqlite-pool.py");
  });
});

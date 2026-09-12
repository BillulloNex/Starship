// @vitest-environment node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const openhandsRoot = path.resolve(here, "../..");
const starshipRoot = path.resolve(openhandsRoot, "..");

describe("automation sqlite pool patch", () => {
  it("is wired into the production image", () => {
    const dockerfile = readFileSync(
      path.join(starshipRoot, "Dockerfile"),
      "utf8",
    );
    expect(dockerfile).toContain("fix-automation-sqlite-pool.py");
  });

  it("rewrites _create_sqlite_engine to NullPool + WAL", () => {
    execFileSync(
      "python3",
      [path.join(here, "automation_sqlite_pool_test.py")],
      {
        stdio: "inherit",
      },
    );
  });
});

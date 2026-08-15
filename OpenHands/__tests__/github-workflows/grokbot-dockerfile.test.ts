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
    expect(dockerfile).toContain(
      "COPY --from=frontend-build /usr/local/bin/node /usr/local/bin/node",
    );
    expect(dockerfile).toContain(
      "COPY --from=frontend-build /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm",
    );
    expect(dockerfile).toContain(
      "ln -sf /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm",
    );
    expect(dockerfile).toContain(
      "ln -sf /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx",
    );
  });
});

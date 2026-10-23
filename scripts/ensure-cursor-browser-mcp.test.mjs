import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(
  new URL("./ensure-cursor-browser-mcp.mjs", import.meta.url),
);

test("Cursor browser MCP config is installed without removing other servers", async () => {
  const home = await mkdtemp(join(tmpdir(), "cursor-mcp-test-"));
  const configPath = join(home, ".cursor", "mcp.json");
  try {
    await mkdir(dirname(configPath));
    await writeFile(
      configPath,
      JSON.stringify({ mcpServers: { existing: { command: "existing-mcp" } } }),
    );

    const result = spawnSync(process.execPath, [script], {
      env: { ...process.env, HOME: home },
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);

    const config = JSON.parse(await readFile(configPath, "utf8"));
    assert.deepEqual(config.mcpServers.existing, { command: "existing-mcp" });
    assert.deepEqual(config.mcpServers["cf-browser-run"], {
      type: "stdio",
      command: "/usr/local/bin/cf-browser-mcp",
      args: [],
    });
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

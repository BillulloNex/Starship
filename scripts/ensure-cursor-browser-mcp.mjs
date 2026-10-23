#!/usr/bin/env node
// Cursor's print-mode CLI discovers MCP servers from ~/.cursor/mcp.json.
// The ACP session's mcpServers list does not reach the `agent -p` child.
import { readFile, mkdir, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const configPath = join(homedir(), ".cursor", "mcp.json");
const browserServer = {
  type: "stdio",
  command: "/usr/local/bin/cf-browser-mcp",
  args: [],
};

let config = {};
try {
  config = JSON.parse(await readFile(configPath, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
if (!config || typeof config !== "object" || Array.isArray(config)) {
  throw new Error(`Invalid Cursor MCP config: ${configPath}`);
}
const servers = config.mcpServers ?? {};
if (!servers || typeof servers !== "object" || Array.isArray(servers)) {
  throw new Error(`Invalid Cursor MCP server map: ${configPath}`);
}
config.mcpServers = { ...servers, "cf-browser-run": browserServer };

await mkdir(dirname(configPath), { recursive: true, mode: 0o700 });
const temporaryPath = `${configPath}.${process.pid}.tmp`;
await writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, {
  mode: 0o600,
});
await rename(temporaryPath, configPath);
console.log("Cursor browser MCP configured: cf-browser-run");

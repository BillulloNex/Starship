import { describe, expect, it } from "vitest";
import { parseRawMcpJson, mcpServerConfigToJson } from "./mcp-json-parser";

describe("parseRawMcpJson", () => {
  it("parses standard mcpServers object wrapper", () => {
    const raw = JSON.stringify({
      mcpServers: {
        github: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
          env: { GITHUB_PERSONAL_ACCESS_TOKEN: "token123" },
        },
        weather: {
          url: "https://mcp.weather.com/sse",
          transport: "sse",
        },
      },
    });

    const result = parseRawMcpJson(raw);
    expect(result.success).toBe(true);
    expect(result.servers).toHaveLength(2);

    const github = result.servers.find((s) => s.name === "github");
    expect(github).toBeDefined();
    expect(github?.config.type).toBe("stdio");
    expect(github?.config.command).toBe("npx");
    expect(github?.config.args).toEqual([
      "-y",
      "@modelcontextprotocol/server-github",
    ]);
    expect(github?.config.env).toEqual({
      GITHUB_PERSONAL_ACCESS_TOKEN: "token123",
    });

    const weather = result.servers.find((s) => s.name === "weather");
    expect(weather).toBeDefined();
    expect(weather?.config.type).toBe("sse");
    expect(weather?.config.url).toBe("https://mcp.weather.com/sse");
  });

  it("parses dictionary of servers without wrapper", () => {
    const raw = JSON.stringify({
      my_tool: {
        command: "python",
        args: ["server.py"],
      },
    });

    const result = parseRawMcpJson(raw);
    expect(result.success).toBe(true);
    expect(result.servers).toHaveLength(1);
    expect(result.servers[0].name).toBe("my_tool");
    expect(result.servers[0].config.command).toBe("python");
  });

  it("parses a single server definition", () => {
    const raw = JSON.stringify({
      name: "fetch-server",
      url: "https://example.com/mcp",
      transport: "shttp",
    });

    const result = parseRawMcpJson(raw);
    expect(result.success).toBe(true);
    expect(result.servers).toHaveLength(1);
    expect(result.servers[0].name).toBe("fetch-server");
    expect(result.servers[0].config.type).toBe("shttp");
    expect(result.servers[0].config.url).toBe("https://example.com/mcp");
  });

  it("handles invalid JSON syntax gracefully", () => {
    const raw = "not a valid json { broken";
    const result = parseRawMcpJson(raw);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid JSON");
  });

  it("handles empty input", () => {
    const result = parseRawMcpJson("");
    expect(result.success).toBe(false);
    expect(result.error).toContain("empty");
  });
});

describe("mcpServerConfigToJson", () => {
  it("formats stdio config correctly", () => {
    const json = mcpServerConfigToJson({
      name: "my-srv",
      type: "stdio",
      command: "node",
      args: ["cli.js"],
      env: { KEY: "VAL" },
    });
    const parsed = JSON.parse(json);
    expect(parsed.command).toBe("node");
    expect(parsed.args).toEqual(["cli.js"]);
    expect(parsed.env).toEqual({ KEY: "VAL" });
  });
});

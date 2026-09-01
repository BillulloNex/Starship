import type { MCPServerConfig, MCPServerType } from "#/types/mcp-server";
import { toMcpServerName } from "./mcp-server-name";

export interface ParsedMcpServerItem {
  id: string;
  name: string;
  config: MCPServerConfig;
  rawJson: Record<string, unknown>;
  isValid: boolean;
  error?: string;
}

export interface ParseMcpJsonResult {
  success: boolean;
  error?: string;
  servers: ParsedMcpServerItem[];
}

const isRecord = (val: unknown): val is Record<string, unknown> =>
  !!val && typeof val === "object" && !Array.isArray(val);

function parseSingleServer(
  key: string,
  entry: Record<string, unknown>,
): ParsedMcpServerItem {
  const rawName =
    typeof entry.name === "string" && entry.name.trim()
      ? entry.name.trim()
      : key;
  const name = toMcpServerName(rawName) || "custom_server";

  // Determine type
  let type: MCPServerType = "stdio";
  if (typeof entry.transport === "string") {
    const t = entry.transport.toLowerCase();
    if (t === "sse") type = "sse";
    else if (t === "shttp" || t === "http" || t === "streamable-http")
      type = "shttp";
    else if (t === "stdio") type = "stdio";
  } else if (typeof entry.url === "string") {
    type = "sse";
  } else if (typeof entry.command === "string") {
    type = "stdio";
  }

  // Parse fields
  const config: MCPServerConfig = {
    id: name,
    name,
    type,
    enabled: entry.enabled !== false,
  };

  if (type === "stdio") {
    if (typeof entry.command === "string" && entry.command.trim()) {
      config.command = entry.command.trim();
    } else {
      return {
        id: name,
        name,
        config,
        rawJson: entry,
        isValid: false,
        error: "Missing required 'command' string for stdio server",
      };
    }

    if (Array.isArray(entry.args)) {
      config.args = entry.args
        .filter((a) => typeof a === "string" || typeof a === "number")
        .map(String);
    }

    if (isRecord(entry.env)) {
      const envRecord: Record<string, string> = {};
      for (const [k, v] of Object.entries(entry.env)) {
        if (typeof v === "string" || typeof v === "number") {
          envRecord[k] = String(v);
        }
      }
      config.env = envRecord;
    }
  } else {
    // Remote (sse or shttp)
    if (typeof entry.url === "string" && entry.url.trim()) {
      config.url = entry.url.trim();
    } else {
      return {
        id: name,
        name,
        config,
        rawJson: entry,
        isValid: false,
        error: "Missing required 'url' string for remote server",
      };
    }

    if (isRecord(entry.headers)) {
      const headersRecord: Record<string, string> = {};
      for (const [k, v] of Object.entries(entry.headers)) {
        if (typeof v === "string" || typeof v === "number") {
          headersRecord[k] = String(v);
        }
      }
      config.headers = headersRecord;
    }

    if (typeof entry.timeout === "number") {
      config.timeout = entry.timeout;
    }
  }

  return {
    id: name,
    name,
    config,
    rawJson: entry,
    isValid: true,
  };
}

/**
 * Parse any raw MCP JSON string into a structured list of MCPServerConfig items.
 * Accepts:
 *  - Standard Claude Desktop format: { "mcpServers": { ... } }
 *  - Dictionary format: { "serverName": { "command": ... } }
 *  - Single server format: { "name": "...", "command": "..." }
 *  - Array format: [ { "name": "...", ... } ]
 */
export function parseRawMcpJson(rawJsonText: string): ParseMcpJsonResult {
  const trimmed = rawJsonText.trim();
  if (!trimmed) {
    return { success: false, error: "JSON input is empty", servers: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err: any) {
    return {
      success: false,
      error: `Invalid JSON syntax: ${err?.message || "Syntax error"}`,
      servers: [],
    };
  }

  if (!parsed || (typeof parsed !== "object" && !Array.isArray(parsed))) {
    return {
      success: false,
      error: "Expected a JSON object or array",
      servers: [],
    };
  }

  const results: ParsedMcpServerItem[] = [];

  if (Array.isArray(parsed)) {
    parsed.forEach((item, index) => {
      if (isRecord(item)) {
        const key =
          typeof item.name === "string" && item.name.trim()
            ? item.name.trim()
            : `server_${index + 1}`;
        results.push(parseSingleServer(key, item));
      }
    });
  } else if (isRecord(parsed)) {
    const serversContainer =
      isRecord(parsed.mcpServers) &&
      !("command" in parsed.mcpServers) &&
      !("url" in parsed.mcpServers)
        ? (parsed.mcpServers as Record<string, unknown>)
        : parsed;

    // Check if it's a single server object
    if (
      typeof serversContainer.command === "string" ||
      typeof serversContainer.url === "string"
    ) {
      const name =
        typeof serversContainer.name === "string" &&
        serversContainer.name.trim()
          ? serversContainer.name.trim()
          : "custom_mcp_server";
      results.push(parseSingleServer(name, serversContainer));
    } else {
      for (const [key, val] of Object.entries(serversContainer)) {
        if (isRecord(val)) {
          results.push(parseSingleServer(key, val));
        }
      }
    }
  }

  if (results.length === 0) {
    return {
      success: false,
      error:
        "No valid MCP server definitions found. Make sure each server defines 'command' (stdio) or 'url' (sse/shttp).",
      servers: [],
    };
  }

  return {
    success: results.some((r) => r.isValid),
    servers: results,
  };
}

/**
 * Format a single MCPServerConfig to clean JSON
 */
export function mcpServerConfigToJson(
  server: Partial<MCPServerConfig>,
  wrapMcpServers = false,
): string {
  const name = server.name || server.id || "custom_server";
  let item: Record<string, unknown>;

  if (server.type === "stdio") {
    item = {
      command: server.command || "npx",
      ...(server.args && server.args.length > 0 ? { args: server.args } : {}),
      ...(server.env && Object.keys(server.env).length > 0
        ? { env: server.env }
        : {}),
    };
  } else {
    item = {
      url: server.url || "https://",
      transport: server.type || "sse",
      ...(server.headers && Object.keys(server.headers).length > 0
        ? { headers: server.headers }
        : {}),
      ...(server.timeout !== undefined ? { timeout: server.timeout } : {}),
    };
  }

  if (wrapMcpServers) {
    return JSON.stringify({ mcpServers: { [name]: item } }, null, 2);
  }

  return JSON.stringify(item, null, 2);
}

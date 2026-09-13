/**
 * Interactive terminals for the IDE view.
 *
 * Serves a WebSocket at WORKBENCH_TERMINAL_PATH. Each connection runs one
 * shell inside a real pseudo-terminal (via workbench-pty-bridge.py, standard
 * library Python only), so vim, htop, Ctrl+C, job control, and resizing all
 * behave like a local terminal.
 *
 * Protocol:
 *   client → server, text:   {"type":"auth","session_api_key":"…"}  (first)
 *                            {"type":"start","cwd":"…","cols":80,"rows":24}
 *                            {"type":"resize","cols":120,"rows":40}
 *   client → server, binary: keystrokes / pasted bytes
 *   server → client, binary: terminal output
 *   server → client, text:   {"type":"ready"} | {"type":"exit","code":0}
 *
 * The shell runs with the same privileges as the agent-server's
 * execute_bash_command API, which the same session key already unlocks.
 * Without a session key the endpoint is disabled entirely.
 */

import { spawn } from "node:child_process";
import { timingSafeEqual } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

export const WORKBENCH_TERMINAL_PATH = "/workbench/terminal";
export const WORKBENCH_TERMINAL_HEALTH_PATH = `${WORKBENCH_TERMINAL_PATH}/health`;

const BRIDGE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "workbench-pty-bridge.py",
);
const MAX_SESSIONS = 16;
const AUTH_TIMEOUT_MS = 10_000;
const MAX_DIMENSION = 1000;

function keysMatch(expected, provided) {
  if (typeof provided !== "string") return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

function clampDimension(value, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, MAX_DIMENSION);
}

function parseControl(data, isBinary) {
  if (isBinary) return null;
  try {
    const message = JSON.parse(data.toString());
    return message && typeof message.type === "string" ? message : null;
  } catch {
    return null;
  }
}

/**
 * @param {{
 *   sessionApiKey: string | null,
 *   pythonBin?: string,
 *   defaultCwd?: string,
 * }} options
 */
export function createWorkbenchTerminalHandler({
  sessionApiKey,
  pythonBin = process.env.WORKBENCH_PYTHON || "python3",
  defaultCwd = process.cwd(),
}) {
  // Mounted at the root like /api and /sockets: clients derive the URL from
  // the agent-server host, not the frontend's base path.
  const socketPath = WORKBENCH_TERMINAL_PATH;
  const healthPath = WORKBENCH_TERMINAL_HEALTH_PATH;
  const wss = new WebSocketServer({ noServer: true });
  const sessions = new Set();

  function pathOf(req) {
    return new URL(req.url ?? "/", "http://localhost").pathname;
  }

  function startShell(ws, { cwd, cols, rows }) {
    const child = spawn(
      pythonBin,
      [
        BRIDGE_PATH,
        "--cwd",
        typeof cwd === "string" && cwd ? cwd : defaultCwd,
        "--cols",
        String(clampDimension(cols, 80)),
        "--rows",
        String(clampDimension(rows, 24)),
      ],
      { stdio: ["pipe", "pipe", "inherit", "pipe"], env: process.env },
    );
    sessions.add(child);

    child.stdout.on("data", (chunk) => {
      if (ws.readyState === ws.OPEN) ws.send(chunk, { binary: true });
    });
    child.on("error", (err) => {
      console.error("[workbench-terminal] failed to start shell:", err.message);
      if (ws.readyState === ws.OPEN) ws.close(1011, "Shell failed to start");
    });
    child.on("exit", (code) => {
      sessions.delete(child);
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: "exit", code: code ?? 0 }));
        ws.close(1000, "Shell exited");
      }
    });
    // Writes after the shell exits are expected during teardown.
    child.stdin.on("error", () => {});
    child.stdio[3].on("error", () => {});

    ws.send(JSON.stringify({ type: "ready" }));
    return child;
  }

  function onConnection(ws) {
    let authenticated = false;
    let child = null;

    const authTimer = setTimeout(() => {
      if (!authenticated) ws.close(4401, "Authentication required");
    }, AUTH_TIMEOUT_MS);

    ws.on("message", (data, isBinary) => {
      const control = parseControl(data, isBinary);

      if (!authenticated) {
        if (
          control?.type === "auth" &&
          keysMatch(sessionApiKey, control.session_api_key)
        ) {
          authenticated = true;
          clearTimeout(authTimer);
        } else {
          ws.close(4401, "Authentication failed");
        }
        return;
      }

      if (!child) {
        if (control?.type === "auth") return;
        if (control?.type !== "start") return;
        if (sessions.size >= MAX_SESSIONS) {
          ws.close(4429, "Too many terminals open");
          return;
        }
        child = startShell(ws, control);
        return;
      }

      if (control?.type === "resize") {
        const cols = clampDimension(control.cols, 80);
        const rows = clampDimension(control.rows, 24);
        child.stdio[3].write(`resize ${cols} ${rows}\n`);
        return;
      }
      if (control) return;
      child.stdin.write(data);
    });

    ws.on("close", () => {
      clearTimeout(authTimer);
      if (child && child.exitCode === null) child.kill("SIGHUP");
    });
  }

  wss.on("connection", onConnection);

  return {
    /** Serves the health probe the frontend uses to detect support. */
    handleRequest(req, res) {
      if (!sessionApiKey || pathOf(req) !== healthPath) return false;
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify({ ok: true }));
      return true;
    },

    /** Accepts terminal WebSocket upgrades; ignores every other path. */
    handleUpgrade(req, socket, head) {
      if (!sessionApiKey || pathOf(req) !== socketPath) return false;
      wss.handleUpgrade(req, socket, head, (ws) =>
        wss.emit("connection", ws, req),
      );
      return true;
    },

    close() {
      sessions.forEach((child) => child.kill("SIGHUP"));
      wss.close();
    },
  };
}

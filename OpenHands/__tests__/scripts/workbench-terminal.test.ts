// @vitest-environment node
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createWorkbenchTerminalHandler } from "../../scripts/workbench-terminal.mjs";

const KEY = "test-session-key";

interface Harness {
  server: Server;
  url: string;
  close: () => Promise<void>;
}

async function startHarness(): Promise<Harness> {
  const terminal = createWorkbenchTerminalHandler({ sessionApiKey: KEY });
  const server = createServer((req, res) => {
    if (!terminal.handleRequest(req, res)) {
      res.writeHead(404);
      res.end();
    }
  });
  server.on("upgrade", (req, socket, head) => {
    if (!terminal.handleUpgrade(req, socket, head)) socket.destroy();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    server,
    url: `127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve) => {
        terminal.close();
        server.close(() => resolve());
      }),
  };
}

function connect(url: string) {
  // Node's built-in WebSocket client, same API as the browser.
  const ws = new WebSocket(`ws://${url}/workbench/terminal`);
  ws.binaryType = "arraybuffer";
  let output = "";
  const decoder = new TextDecoder();
  const controls: { type: string; code?: number }[] = [];
  ws.addEventListener("message", (event) => {
    if (typeof event.data === "string") controls.push(JSON.parse(event.data));
    else output += decoder.decode(event.data as ArrayBuffer, { stream: true });
  });
  const closed = new Promise<number>((resolve) =>
    ws.addEventListener("close", (event) => resolve(event.code)),
  );
  return {
    ws,
    closed,
    controls,
    output: () => output,
    opened: new Promise<void>((resolve) =>
      ws.addEventListener("open", () => resolve()),
    ),
  };
}

async function waitFor(check: () => boolean, timeoutMs = 10_000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error("Timed out waiting");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe("workbench terminal", () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await startHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  it("answers the health probe", async () => {
    const res = await fetch(`http://${harness.url}/workbench/terminal/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("rejects a connection with the wrong session key", async () => {
    const client = connect(harness.url);
    await client.opened;
    client.ws.send(JSON.stringify({ type: "auth", session_api_key: "nope" }));
    expect(await client.closed).toBe(4401);
  });

  it("runs an interactive shell in a real tty in the requested directory", async () => {
    const cwd = realpathSync(mkdtempSync(path.join(tmpdir(), "wb-term-")));
    const client = connect(harness.url);
    await client.opened;
    client.ws.send(JSON.stringify({ type: "auth", session_api_key: KEY }));
    client.ws.send(JSON.stringify({ type: "start", cwd, cols: 100, rows: 30 }));
    await waitFor(() => client.controls.some((c) => c.type === "ready"));

    client.ws.send(
      new TextEncoder().encode(
        "stty size; test -t 0 && echo IS_TTY; pwd; export WB_VAR=kept\r",
      ),
    );
    await waitFor(() => client.output().includes(cwd));
    expect(client.output()).toContain("30 100");
    expect(client.output()).toContain("IS_TTY");

    // Environment persists between commands, unlike one-shot command runs.
    client.ws.send(new TextEncoder().encode("echo value=$WB_VAR\r"));
    await waitFor(() => client.output().includes("value=kept"));

    client.ws.send(JSON.stringify({ type: "resize", cols: 120, rows: 40 }));
    client.ws.send(new TextEncoder().encode("stty size\r"));
    await waitFor(() => client.output().includes("40 120"));

    client.ws.send(new TextEncoder().encode("exit 3\r"));
    expect(await client.closed).toBe(1000);
    expect(client.controls.at(-1)).toEqual({ type: "exit", code: 3 });
  }, 20_000);

  it("interrupts a running command with Ctrl+C", async () => {
    const client = connect(harness.url);
    await client.opened;
    client.ws.send(JSON.stringify({ type: "auth", session_api_key: KEY }));
    client.ws.send(JSON.stringify({ type: "start", cols: 80, rows: 24 }));
    await waitFor(() => client.controls.some((c) => c.type === "ready"));

    client.ws.send(new TextEncoder().encode("sleep 30; echo DONE_$((1+1))\r"));
    await new Promise((resolve) => setTimeout(resolve, 500));
    client.ws.send(new TextEncoder().encode("\x03"));
    client.ws.send(new TextEncoder().encode("echo AFTER_$((2+2))\r"));
    // Well under the 30s sleep, and the sleep's follow-up never ran.
    await waitFor(() => client.output().includes("AFTER_4"), 5_000);
    expect(client.output()).not.toContain("DONE_2");
    client.ws.close();
  }, 20_000);
});

describe("workbench terminal without a session key", () => {
  it("stays disabled rather than serving unauthenticated shells", () => {
    const terminal = createWorkbenchTerminalHandler({ sessionApiKey: null });
    const req = { url: "/workbench/terminal" } as never;
    const healthReq = { url: "/workbench/terminal/health" } as never;
    expect(terminal.handleUpgrade(req, {} as never, Buffer.alloc(0))).toBe(
      false,
    );
    expect(terminal.handleRequest(healthReq, {} as never)).toBe(false);
    terminal.close();
  });
});

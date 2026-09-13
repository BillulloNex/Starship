import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  TerminalConnection,
  type TerminalConnectionOptions,
  type TerminalSocket,
} from "#/components/features/ide-layout/terminal/terminal-connection";

class FakeSocket implements TerminalSocket {
  binaryType: BinaryType = "blob";

  readyState = 0;

  onopen: ((event: Event) => void) | null = null;

  onmessage: ((event: MessageEvent) => void) | null = null;

  onclose: ((event: CloseEvent) => void) | null = null;

  sent: (string | Uint8Array)[] = [];

  send = (data: string | ArrayBufferLike | ArrayBufferView) => {
    this.sent.push(typeof data === "string" ? data : (data as Uint8Array));
  };

  close = vi.fn();

  open() {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }

  receive(data: string | ArrayBuffer) {
    this.onmessage?.({ data } as MessageEvent);
  }

  controls() {
    return this.sent
      .filter((d): d is string => typeof d === "string")
      .map((d) => JSON.parse(d));
  }

  bytes() {
    return this.sent
      .filter((d): d is Uint8Array => typeof d !== "string")
      .map((d) => new TextDecoder().decode(d));
  }
}

describe("TerminalConnection", () => {
  let socket: FakeSocket;
  let onOutput: ReturnType<typeof vi.fn<TerminalConnectionOptions["onOutput"]>>;
  let onStatus: ReturnType<typeof vi.fn<TerminalConnectionOptions["onStatus"]>>;

  const create = () =>
    new TerminalConnection({
      url: "ws://host/workbench/terminal",
      sessionApiKey: "key",
      cwd: "/workspace/project",
      cols: 80,
      rows: 24,
      onOutput,
      onStatus,
      createSocket: () => socket,
    });

  beforeEach(() => {
    socket = new FakeSocket();
    onOutput = vi.fn<TerminalConnectionOptions["onOutput"]>();
    onStatus = vi.fn<TerminalConnectionOptions["onStatus"]>();
  });

  it("authenticates, then starts a shell sized to the view", () => {
    create();
    expect(socket.binaryType).toBe("arraybuffer");
    socket.open();
    expect(socket.controls()).toEqual([
      { type: "auth", session_api_key: "key" },
      { type: "start", cwd: "/workspace/project", cols: 80, rows: 24 },
    ]);
  });

  it("buffers typing until the shell is ready", () => {
    const connection = create();
    socket.open();
    connection.write("ls\r");
    expect(socket.bytes()).toEqual([]);

    socket.receive(JSON.stringify({ type: "ready" }));
    expect(onStatus).toHaveBeenCalledWith("ready", undefined);
    expect(socket.bytes()).toEqual(["ls\r"]);
  });

  it("sends a resize that happened while the shell was starting", () => {
    const connection = create();
    socket.open();
    connection.resize(120, 40);
    socket.receive(JSON.stringify({ type: "ready" }));
    expect(socket.controls().at(-1)).toEqual({
      type: "resize",
      cols: 120,
      rows: 40,
    });
  });

  it("streams output and reports exit", () => {
    create();
    socket.open();
    socket.receive(JSON.stringify({ type: "ready" }));
    socket.receive(new TextEncoder().encode("hello").buffer as ArrayBuffer);
    expect(new TextDecoder().decode(onOutput.mock.calls[0][0])).toBe("hello");

    socket.receive(JSON.stringify({ type: "exit", code: 2 }));
    socket.onclose?.({} as CloseEvent);
    expect(onStatus).toHaveBeenLastCalledWith("exited", 2);
  });

  it("reports an unexpected close as a disconnect", () => {
    create();
    socket.open();
    socket.onclose?.({} as CloseEvent);
    expect(onStatus).toHaveBeenLastCalledWith("disconnected", undefined);
  });

  it("ignores duplicate resizes", () => {
    const connection = create();
    socket.open();
    socket.receive(JSON.stringify({ type: "ready" }));
    const before = socket.sent.length;
    connection.resize(80, 24);
    expect(socket.sent.length).toBe(before);
  });
});

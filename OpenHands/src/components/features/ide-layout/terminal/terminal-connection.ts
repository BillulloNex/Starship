export type TerminalStatus = "connecting" | "ready" | "exited" | "disconnected";

export interface TerminalSocket {
  binaryType: BinaryType;
  readyState: number;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  send: (data: string | ArrayBufferLike | ArrayBufferView) => void;
  close: () => void;
}

export interface TerminalConnectionOptions {
  url: string;
  sessionApiKey: string | null;
  cwd?: string;
  cols: number;
  rows: number;
  onOutput: (data: Uint8Array) => void;
  onStatus: (status: TerminalStatus, exitCode?: number) => void;
  createSocket?: (url: string) => TerminalSocket;
}

const OPEN = 1;

/**
 * Client side of the workbench terminal protocol (see
 * scripts/workbench-terminal.mjs): authenticates, starts a shell sized to
 * the view, then streams keystrokes and output as binary frames.
 */
export class TerminalConnection {
  private readonly socket: TerminalSocket;

  private readonly encoder = new TextEncoder();

  private status: TerminalStatus = "connecting";

  private pendingInput: Uint8Array[] = [];

  private size: { cols: number; rows: number };

  private startedSize: { cols: number; rows: number } | null = null;

  constructor(private readonly options: TerminalConnectionOptions) {
    this.size = { cols: options.cols, rows: options.rows };
    const createSocket =
      options.createSocket ??
      ((url: string) => new WebSocket(url) as unknown as TerminalSocket);
    this.socket = createSocket(options.url);
    this.socket.binaryType = "arraybuffer";

    this.socket.onopen = () => {
      this.startedSize = { ...this.size };
      this.socket.send(
        JSON.stringify({
          type: "auth",
          session_api_key: options.sessionApiKey ?? "",
        }),
      );
      this.socket.send(
        JSON.stringify({
          type: "start",
          cwd: options.cwd,
          cols: this.size.cols,
          rows: this.size.rows,
        }),
      );
    };

    this.socket.onmessage = (event) => {
      if (typeof event.data !== "string") {
        options.onOutput(new Uint8Array(event.data as ArrayBuffer));
        return;
      }
      let message: { type?: string; code?: number };
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.type === "ready") {
        this.setStatus("ready");
        // The view may have been resized while the shell was starting.
        const { cols, rows } = this.size;
        if (
          cols !== this.startedSize?.cols ||
          rows !== this.startedSize?.rows
        ) {
          this.socket.send(JSON.stringify({ type: "resize", cols, rows }));
        }
        this.flushPendingInput();
      } else if (message.type === "exit") {
        this.setStatus("exited", message.code ?? 0);
      }
    };

    this.socket.onclose = () => {
      if (this.status !== "exited") this.setStatus("disconnected");
    };
  }

  private setStatus(status: TerminalStatus, exitCode?: number) {
    this.status = status;
    this.options.onStatus(status, exitCode);
  }

  private flushPendingInput() {
    this.pendingInput.forEach((chunk) => this.socket.send(chunk));
    this.pendingInput = [];
  }

  getStatus(): TerminalStatus {
    return this.status;
  }

  /** Sends keystrokes or pasted text to the shell. */
  write(data: string) {
    const bytes = this.encoder.encode(data);
    if (this.status === "connecting") {
      this.pendingInput.push(bytes);
    } else if (this.status === "ready" && this.socket.readyState === OPEN) {
      this.socket.send(bytes);
    }
  }

  resize(cols: number, rows: number) {
    if (cols === this.size.cols && rows === this.size.rows) return;
    this.size = { cols, rows };
    if (this.status === "ready" && this.socket.readyState === OPEN) {
      this.socket.send(JSON.stringify({ type: "resize", cols, rows }));
    }
  }

  dispose() {
    this.socket.onclose = null;
    this.socket.onmessage = null;
    this.socket.close();
  }
}

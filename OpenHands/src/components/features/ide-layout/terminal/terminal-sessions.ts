import { create } from "zustand";
import type { Terminal } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";
import { TerminalConnection, type TerminalStatus } from "./terminal-connection";

export interface TerminalSessionInfo {
  id: string;
  /** Terminals belong to the workspace they were opened in. */
  workspaceKey: string;
  title: string;
  status: TerminalStatus;
  exitCode?: number;
}

export interface TerminalTarget {
  workspaceKey: string;
  url: string;
  sessionApiKey: string | null;
  cwd?: string;
}

interface TerminalRuntime {
  wrapper: HTMLDivElement;
  term: Terminal;
  fit: FitAddon;
  connection: TerminalConnection | null;
  target: TerminalTarget;
  opened: boolean;
}

interface TerminalSessionsState {
  sessions: TerminalSessionInfo[];
  activeId: string | null;
  setActiveId: (id: string) => void;
}

export const useTerminalSessionsStore = create<TerminalSessionsState>()(
  (set) => ({
    sessions: [],
    activeId: null,
    setActiveId: (activeId) => set({ activeId }),
  }),
);

const runtimes = new Map<string, TerminalRuntime>();
const titleCounters = new Map<string, number>();
let nextId = 1;

function updateSession(id: string, patch: Partial<TerminalSessionInfo>) {
  useTerminalSessionsStore.setState((state) => ({
    sessions: state.sessions.map((session) =>
      session.id === id ? { ...session, ...patch } : session,
    ),
  }));
}

async function loadXterm() {
  const [{ Terminal: XTerm }, { FitAddon: Fit }] = await Promise.all([
    import("@xterm/xterm"),
    import("@xterm/addon-fit"),
  ]);
  return { XTerm, Fit };
}

function connect(id: string, runtime: TerminalRuntime) {
  runtime.connection?.dispose();
  updateSession(id, { status: "connecting", exitCode: undefined });
  const { term } = runtime;
  // eslint-disable-next-line no-param-reassign
  runtime.connection = new TerminalConnection({
    url: runtime.target.url,
    sessionApiKey: runtime.target.sessionApiKey,
    cwd: runtime.target.cwd,
    cols: term.cols,
    rows: term.rows,
    onOutput: (data) => term.write(data),
    onStatus: (status, exitCode) => {
      updateSession(id, { status, exitCode });
      if (status === "exited") {
        term.write(
          `\r\n\x1b[2m[Process exited with code ${exitCode}]\x1b[0m\r\n`,
        );
      } else if (status === "disconnected") {
        term.write("\r\n\x1b[2m[Disconnected]\x1b[0m\r\n");
      }
    },
  });
}

/**
 * Terminal sessions live outside React so a shell survives closing the
 * terminal panel or switching between the Agent and IDE views. They end
 * when their tab is closed or the page unloads.
 */
export async function createTerminalSession(
  target: TerminalTarget,
): Promise<string> {
  const id = `term-${Date.now().toString(36)}-${nextId}`;
  nextId += 1;
  const { workspaceKey } = target;
  const titleNumber = (titleCounters.get(workspaceKey) ?? 0) + 1;
  titleCounters.set(workspaceKey, titleNumber);
  const title = `Terminal ${titleNumber}`;

  const { XTerm, Fit } = await loadXterm();
  const term = new XTerm({
    fontFamily: "Menlo, Monaco, 'Courier New', monospace",
    fontSize: 13,
    scrollback: 10000,
    cursorBlink: true,
    allowProposedApi: false,
    theme: { background: "#141414", foreground: "#e5e5e5" },
  });
  const fit = new Fit();
  term.loadAddon(fit);

  const wrapper = document.createElement("div");
  wrapper.style.width = "100%";
  wrapper.style.height = "100%";

  const runtime: TerminalRuntime = {
    wrapper,
    term,
    fit,
    connection: null,
    target,
    opened: false,
  };
  term.onData((data) => runtime.connection?.write(data));
  term.onResize(({ cols, rows }) => runtime.connection?.resize(cols, rows));
  runtimes.set(id, runtime);

  useTerminalSessionsStore.setState((state) => ({
    sessions: [
      ...state.sessions,
      { id, workspaceKey, title, status: "connecting" },
    ],
    activeId: id,
  }));
  return id;
}

/** Mounts a session's terminal into `host`, connecting on first mount. */
export function attachTerminalSession(id: string, host: HTMLElement) {
  const runtime = runtimes.get(id);
  if (!runtime) return;
  host.appendChild(runtime.wrapper);
  if (!runtime.opened) {
    runtime.term.open(runtime.wrapper);
    runtime.opened = true;
  }
  fitTerminalSession(id);
  if (!runtime.connection) connect(id, runtime);
}

export function detachTerminalSession(id: string) {
  runtimes.get(id)?.wrapper.remove();
}

export function fitTerminalSession(id: string) {
  const runtime = runtimes.get(id);
  if (!runtime?.opened || !runtime.wrapper.isConnected) return;
  const { clientWidth, clientHeight } = runtime.wrapper;
  if (clientWidth === 0 || clientHeight === 0) return;
  runtime.fit.fit();
}

export function focusTerminalSession(id: string) {
  runtimes.get(id)?.term.focus();
}

export function restartTerminalSession(id: string) {
  const runtime = runtimes.get(id);
  if (!runtime) return;
  runtime.term.reset();
  connect(id, runtime);
}

export function closeTerminalSession(id: string) {
  const runtime = runtimes.get(id);
  if (runtime) {
    runtime.connection?.dispose();
    runtime.term.dispose();
    runtime.wrapper.remove();
    runtimes.delete(id);
  }
  useTerminalSessionsStore.setState((state) => {
    const closing = state.sessions.find((s) => s.id === id);
    const siblings = state.sessions.filter(
      (s) => s.workspaceKey === closing?.workspaceKey,
    );
    const index = siblings.findIndex((s) => s.id === id);
    const remaining = siblings.filter((s) => s.id !== id);
    const activeId =
      state.activeId === id
        ? (remaining[Math.max(0, index - 1)]?.id ?? null)
        : state.activeId;
    return {
      sessions: state.sessions.filter((s) => s.id !== id),
      activeId,
    };
  });
}

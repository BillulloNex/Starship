#!/usr/bin/env python3
"""Runs an interactive shell in a pseudo-terminal for the IDE terminal.

Standard library only, so it works anywhere python3 does. The parent process
talks to it over plain pipes:

  stdin  (fd 0)  bytes typed by the user, forwarded to the terminal
  stdout (fd 1)  bytes produced by the terminal
  fd 3           control lines, currently only "resize <cols> <rows>"

The bridge exits with the shell's exit status. Closing stdin or sending
SIGHUP/SIGTERM hangs up the shell's whole process group.
"""

import argparse
import errno
import fcntl
import os
import pty
import select
import shutil
import signal
import struct
import sys
import termios

CONTROL_FD = 3
READ_SIZE = 65536


def set_window_size(fd, cols, rows):
    size = struct.pack("HHHH", max(rows, 1), max(cols, 1), 0, 0)
    fcntl.ioctl(fd, termios.TIOCSWINSZ, size)


def pick_shell():
    for candidate in (os.environ.get("SHELL"), "bash", "sh"):
        if candidate and shutil.which(candidate):
            return shutil.which(candidate)
    return "/bin/sh"


def write_all(fd, data):
    view = memoryview(data)
    while view:
        try:
            written = os.write(fd, view)
        except OSError as exc:
            if exc.errno in (errno.EAGAIN, errno.EINTR):
                select.select([], [fd], [], 1)
                continue
            raise
        view = view[written:]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cwd", default=os.getcwd())
    parser.add_argument("--cols", type=int, default=80)
    parser.add_argument("--rows", type=int, default=24)
    args = parser.parse_args()

    cwd = args.cwd if os.path.isdir(args.cwd) else os.path.expanduser("~")
    shell = pick_shell()

    pid, master = pty.fork()
    if pid == 0:
        os.chdir(cwd)
        env = dict(os.environ)
        env["TERM"] = "xterm-256color"
        env["COLORTERM"] = "truecolor"
        env.setdefault("LANG", "C.UTF-8")
        os.execvpe(shell, [shell, "-l"], env)

    set_window_size(master, args.cols, args.rows)

    def hang_up(*_):
        try:
            os.killpg(pid, signal.SIGHUP)
        except OSError:
            pass

    signal.signal(signal.SIGHUP, hang_up)
    signal.signal(signal.SIGTERM, hang_up)

    has_control = _fd_open(CONTROL_FD)
    control_buffer = b""
    watched = [master, 0] + ([CONTROL_FD] if has_control else [])

    while True:
        try:
            readable, _, _ = select.select(watched, [], [])
        except InterruptedError:
            continue

        if master in readable:
            try:
                data = os.read(master, READ_SIZE)
            except OSError:
                data = b""
            if not data:
                break
            write_all(1, data)

        if 0 in readable:
            data = os.read(0, READ_SIZE)
            if not data:
                hang_up()
                watched.remove(0)
            else:
                write_all(master, data)

        if CONTROL_FD in readable:
            chunk = os.read(CONTROL_FD, 4096)
            if not chunk:
                watched.remove(CONTROL_FD)
                continue
            control_buffer += chunk
            while b"\n" in control_buffer:
                line, control_buffer = control_buffer.split(b"\n", 1)
                parts = line.decode("ascii", "ignore").split()
                if len(parts) == 3 and parts[0] == "resize":
                    # The kernel signals SIGWINCH to the foreground job.
                    try:
                        set_window_size(master, int(parts[1]), int(parts[2]))
                    except (ValueError, OSError):
                        pass

    _, status = os.waitpid(pid, 0)
    sys.exit(os.waitstatus_to_exitcode(status))


def _fd_open(fd):
    try:
        os.fstat(fd)
        return True
    except OSError:
        return False


if __name__ == "__main__":
    main()

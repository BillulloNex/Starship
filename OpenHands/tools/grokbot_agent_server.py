#!/usr/bin/env python3
"""Start agent-server after Grokbot sitecustomize has loaded.

``openhands-agent-server`` is a console script. Depending on how that
entrypoint is packaged, PYTHONPATH sitecustomize may never run, which is
why FastMCP kept binding a random loopback OAuth port in production.

Running this file puts ``/opt/agent-canvas/tools`` on ``sys.path`` first,
imports sitecustomize explicitly, then hands off to agent-server.
"""
from __future__ import annotations

import runpy
import sys
from pathlib import Path

tools = Path(__file__).resolve().parent
if str(tools) not in sys.path:
    sys.path.insert(0, str(tools))

import sitecustomize  # noqa: E402,F401

if __name__ == "__main__":
    sys.argv[0] = "openhands-agent-server"
    runpy.run_module("openhands.agent_server", run_name="__main__")

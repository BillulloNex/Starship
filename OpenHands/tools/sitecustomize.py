"""
Grokbot sitecustomize — Auto-loaded by Python on startup.

This file is intentionally minimal. Datadog LLM Observability is handled
entirely by `ddtrace-run` which wraps the agent-server process. The
following environment variables (set in entrypoint.sh) control behavior:

  DD_LLMOBS_ENABLED=1
  DD_LLMOBS_ML_APP=grokbot
  DD_LLMOBS_AGENTLESS_ENABLED=1
  DD_SITE=us5.datadoghq.com
  DD_API_KEY=<from Coolify>

ddtrace-run auto-patches litellm.completion / litellm.acompletion and
sends LLM spans directly to Datadog's LLMObs intake. No manual patching
or LLMObs.enable() call is needed here — doing so causes double-init
conflicts that silently prevent spans from being submitted.

This file only provides a lightweight startup log for debugging.
"""
import os
import sys

_api_key = os.environ.get("DD_API_KEY", "")
_llmobs = os.environ.get("DD_LLMOBS_ENABLED", "0")
_ml_app = os.environ.get("DD_LLMOBS_ML_APP", "")
_site = os.environ.get("DD_SITE", "")
_agentless = os.environ.get("DD_LLMOBS_AGENTLESS_ENABLED", "0")

if _api_key and _llmobs in ("1", "true", "yes"):
    print(
        f"[grokbot-sitecustomize] LLMObs config detected — "
        f"ml_app={_ml_app}, site={_site}, agentless={_agentless}. "
        f"Tracing is handled by ddtrace-run (no manual init here).",
        file=sys.stderr, flush=True,
    )
